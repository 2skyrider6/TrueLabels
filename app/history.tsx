import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useResult } from '@/context/ResultContext';
import { useHaptic } from '@/hooks/useHaptic';
import { deleteScan, getScanById, clearHistory, HistoryScan } from '@/db/history';
import { Flag, ParsedIngredients, ScanResult, Verdict } from '@/rules/types';
import { Badge, Button, EmptyState, ScoreRing } from '@/components/ui';
import { AnimatedButton, SlideUp } from '@/components/animated';
import { colors, radii, shadows, spacing, toneColors, typography, verdictTone } from '@/theme/tokens';
import { safetyScore } from '@/ai/merge';

function parseJsonArray<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

const VERDICT_ICON = {
  safe: 'checkmark-circle' as const,
  caution: 'alert-circle' as const,
  unsafe: 'warning' as const,
  neutral: 'help-circle' as const,
};

export default function HistoryScreen() {
  const { scans, hasMore, refreshScans, loadMore, setResult } = useResult();
  const navigation = useRouter();
  const { trigger: haptic } = useHaptic();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredScans = useMemo(() => {
    if (!searchQuery.trim()) return scans;
    const q = searchQuery.toLowerCase();
    return scans.filter(scan => {
      const productName = (scan.productName || '').toLowerCase();
      const barcode = (scan.barcode || '').toLowerCase();
      const verdict = (scan.verdict || '').toLowerCase();
      const source = (scan.source || '').toLowerCase();
      return productName.includes(q) || barcode.includes(q) || verdict.includes(q) || source.includes(q);
    });
  }, [scans, searchQuery]);

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert('Delete scan?', 'This will remove the scan from your history.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptic('warning');
            setDeletingId(id);
            try {
              deleteScan(id);
              refreshScans();
            } catch (error) {
              console.error('Failed to delete scan:', error);
              Alert.alert('Error', 'Could not delete this scan.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]);
    },
    [refreshScans, haptic]
  );

  const handleClearAll = useCallback(() => {
    Alert.alert('Clear All', 'Delete all scan history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          haptic('warning');
          try {
            clearHistory();
            refreshScans();
          } catch (error) {
            console.error('Failed to clear history:', error);
            Alert.alert('Error', 'Could not clear history.');
          }
        },
      },
    ]);
  }, [refreshScans, haptic]);

  const handleViewScan = useCallback(
    (id: number) => {
      let scan: HistoryScan | null = null;
      try {
        scan = getScanById(id);
      } catch (error) {
        console.error('Failed to read scan:', error);
      }
      if (!scan) {
        Alert.alert('Error', 'This scan could not be read.');
        return;
      }

      const parsed: ParsedIngredients = {
        ingredients: parseJsonArray<string>(scan.ingredientsJson, []),
        declaredAllergens: parseJsonArray<string>(scan.declaredAllergensJson, []),
        mayContain: parseJsonArray<string>(scan.mayContainJson, []),
      };

      const result: ScanResult = {
        source: scan.source,
        barcode: scan.barcode,
        productName: scan.productName,
        brands: scan.brands,
        imageUrl: scan.imageUri,
        rawIngredients: scan.rawText || '',
        parsed,
        flags: parseJsonArray<Flag>(scan.flagsJson, []),
        verdict: (scan.verdict || 'safe') as Verdict,
        vegMark: scan.vegMark || 'unknown',
        offAttribution: scan.source === 'barcode',
        offUrl: scan.offUrl,
        createdAt: scan.createdAt,
        rulesetVersion: scan.rulesetVersion || 'unknown',
        // Carried through so a scan that could not be read is not re-opened as a
        // normal result.
        insufficientData: scan.insufficientData,
      };

      // Second argument: viewing history must not re-insert the scan.
      setResult(result, false);
      navigation.push('/result');
    },
    [navigation, setResult]
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderScan = ({ item: scan, index }: { item: HistoryScan; index: number }) => {
    // An unreadable scan must never look like a clean green result in the list.
    const tone = verdictTone(scan.insufficientData ? 'unknown' : scan.verdict);
    const palette = toneColors(tone);
    const title = scan.productName || 'Unknown product';
    // Coverage defaults to unverified, matching the read path: a row whose
    // coverage could not be established must not score as a pass either.
    const coverage = scan.coverage ?? 'unverified';
    const flagCount = parseJsonArray<Flag>(scan.flagsJson, []).length;

    return (
      <SlideUp delay={Math.min(index * 50, 300)}>
        <AnimatedButton
          onPress={() => handleViewScan(scan.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open scan: ${title}, ${
            scan.insufficientData ? 'not read' : scan.verdict
          }, ${formatDate(scan.createdAt)}`}
          style={styles.scanCard}
        >
          <View style={[styles.verdictStripe, { backgroundColor: palette.fg }]} />

          <View style={styles.scanBody}>
            <View style={styles.scanHeaderRow}>
              <Text style={styles.scanProductName} numberOfLines={1}>
                {title}
              </Text>
              <Badge
                label={scan.insufficientData ? 'Not read' : scan.verdict || 'unknown'}
                icon={scan.insufficientData ? 'help' : VERDICT_ICON[tone]}
                fg={palette.fg}
                bg={palette.bg}
                border={palette.border}
              />
            </View>

            <View style={styles.scanMetaRow}>
              <Ionicons name="time-outline" size={12} color={colors.textSubtle} style={styles.metaIcon} />
              <Text style={styles.scanDate} numberOfLines={1}>
                {formatDate(scan.createdAt)}
              </Text>
              <View style={styles.metaDot} />
              <Text style={styles.scanSource} numberOfLines={1}>
                {scan.barcode ? scan.barcode : sourceLabel(scan.source)}
              </Text>
            </View>
          </View>

          {/* Score ring summarises the scan without opening it. It inherits the
              same band rules as the result screen, so an unreadable or
              unverified scan never shows a green ring here. */}
          <View style={styles.scanRingSlot}>
            <ScoreRing
              score={safetyScore({
                verdict: (scan.verdict || 'safe') as Verdict,
                coverage,
                insufficientData: !!scan.insufficientData,
                flagCount,
              })}
              size={44}
              thickness={4}
              accessibilityLabel={`Score for ${title}`}
            />
          </View>

          <AnimatedButton
            onPress={() => handleDelete(scan.id)}
            disabled={deletingId === scan.id}
            accessibilityRole="button"
            accessibilityLabel={`Delete scan of ${title}`}
            accessibilityState={{ disabled: deletingId === scan.id }}
            hitSlop={10}
            style={styles.deleteButton}
          >
            {deletingId === scan.id ? (
              <ActivityIndicator size="small" color={colors.textSubtle} />
            ) : (
              <Ionicons name="trash-outline" size={17} color={colors.textSubtle} />
            )}
          </AnimatedButton>
        </AnimatedButton>
      </SlideUp>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            History
          </Text>
          {scans.length > 0 ? (
            <Text style={styles.headerSubtitle}>
              {scans.length} scan{scans.length === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
        {scans.length > 0 ? (
          <Pressable
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all scan history"
            hitSlop={8}
            style={({ pressed }) => [styles.clearButton, pressed && styles.clearButtonPressed]}
          >
            <Text style={styles.clearButtonText}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search scans..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {scans.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="time-outline"
            title="No scans yet"
            message="Scan a barcode or food label and your results will collect here."
            action={
              <Button
                label="Start scanning"
                icon="scan-outline"
                onPress={() => navigation.replace('/')}
              />
            }
          />
        </View>
      ) : (
        <FlatList
          data={filteredScans}
          keyExtractor={scan => String(scan.id)}
          renderItem={renderScan}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            hasMore ? (
              <Pressable
                onPress={loadMore}
                accessibilityRole="button"
                accessibilityLabel="Load more scans"
                style={({ pressed }) => [styles.loadMoreButton, pressed && styles.loadMorePressed]}
              >
                <Text style={styles.loadMoreText}>Load more</Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </View>
  );
}

function sourceLabel(source: string) {
  switch (source) {
    case 'barcode':
      return 'Barcode scan';
    case 'label':
      return 'Label photo';
    default:
      return 'Typed entry';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  headerTitle: { ...typography.title, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  clearButtonPressed: { backgroundColor: colors.surfaceMuted },
  clearButtonText: { ...typography.captionStrong, color: colors.danger },

  emptyWrap: { flex: 1, justifyContent: 'center' },

  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.huge },

  searchBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchIcon: { marginRight: spacing.sm, marginTop: 1 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },

  scanCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  scanCardPressed: { backgroundColor: colors.surfaceSunken },
  // Colour-coded left edge communicates the verdict without adding a chip.
  verdictStripe: { width: 4 },
  scanRingSlot: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  scanBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  scanHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scanProductName: { ...typography.subheading, color: colors.text, flex: 1 },
  scanMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaIcon: { marginTop: 1 },
  scanDate: { ...typography.caption, color: colors.textSubtle, flexShrink: 1 },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
  },
  scanSource: { ...typography.caption, color: colors.textSubtle, flexShrink: 1 },

  deleteButton: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  deleteButtonPressed: { backgroundColor: colors.surfaceMuted },

  loadMoreButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadMorePressed: { backgroundColor: colors.surfaceSunken },
  loadMoreText: { ...typography.bodyStrong, color: colors.primary },
});