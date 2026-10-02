import { useCallback, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchProductByBarcode, searchProductsByName, SearchResult } from '@/off/client';
import { useResult } from '@/context/ResultContext';
import { parseIngredients } from '@/rules/parser';
import { evaluateEngine, loadRuleset } from '@/rules/engine';
import { Button, Callout, Card, SectionHeading } from '@/components/ui';
import { colors, radii, spacing, typography } from '@/theme/tokens';

const ruleset = loadRuleset();

/**
 * Shown when a barcode cannot be answered from Open Food Facts.
 *
 * The scanner is deliberately exited rather than left pointed at the camera:
 * retrying the same unknown barcode cannot succeed, so the useful next step is
 * to identify the product another way.
 */
export default function NotFoundScreen() {
  const params = useLocalSearchParams<{
    barcode?: string;
    productName?: string;
    reason?: string;
  }>();
  const navigation = useRouter();
  const { setResult } = useResult();

  const barcode = (params.barcode as string) ?? '';
  const productName = (params.productName as string) ?? '';
  const missingIngredients = params.reason === 'ingredients';

  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const term = query.trim();
    if (term.length < 2) return;
    setSearching(true);
    try {
      setResults(await searchProductsByName(term));
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const openProduct = useCallback(
    async (result: SearchResult) => {
      setOpening(result.code);
      try {
        const { product } = await fetchProductByBarcode(result.code);
        const rawIngredients = product?.ingredients_text?.trim() ?? '';

        // A search hit can still lack ingredients; fall back to the label rather
        // than opening an empty result.
        if (!rawIngredients) {
          navigation.replace('/label-scan');
          return;
        }

        const parsed = parseIngredients(rawIngredients);
        const { flags, verdict, insufficientData } = evaluateEngine(parsed, ruleset);

        setResult({
          source: 'barcode',
          barcode: result.code,
          productName: product?.product_name || result.name,
          brands: product?.brands || result.brands,
          imageUrl: product?.image_front_url || result.imageUrl,
          rawIngredients,
          parsed,
          flags,
          verdict,
          insufficientData,
          vegMark: 'unknown',
          offAttribution: true,
          offUrl: `https://world.openfoodfacts.org/product/${result.code}`,
          createdAt: new Date().toISOString(),
          rulesetVersion: ruleset.rulesetVersion,
        });
        navigation.replace('/result');
      } catch {
        navigation.replace('/label-scan');
      } finally {
        setOpening(null);
      }
    },
    [navigation, setResult]
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <View style={styles.headerIcon}>
            <Ionicons
              name={missingIngredients ? 'document-text-outline' : 'search-outline'}
              size={24}
              color={colors.caution}
            />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {missingIngredients ? 'No ingredient list' : 'Barcode not recognised'}
          </Text>
          <Text style={styles.subtitle}>
            {missingIngredients
              ? productName
                ? `${productName} is in the Open Food Facts database, but nobody has entered its ingredients yet.`
                : 'This product is in the Open Food Facts database, but nobody has entered its ingredients yet.'
              : `Barcode ${barcode} is not in the Open Food Facts database. The database is community-maintained, so many packs are missing.`}
          </Text>
        </View>

        {/* Reading the pack always works, so it is offered first. */}
        <View style={styles.actionGroup}>
          <Button
            label="Scan the ingredient label"
            icon="camera-outline"
            onPress={() => navigation.replace('/label-scan')}
          />
          <Button
            label="Type the ingredients"
            variant="secondary"
            icon="clipboard-outline"
            onPress={() => navigation.replace('/paste')}
          />
        </View>

        {/* Name search: recovers products indexed by name but not by GTIN. */}
        <View style={styles.searchSection}>
          <SectionHeading
            eyebrow="Alternative"
            title="Search by product name"
            icon="search-outline"
          />
          <Card padded={false}>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="e.g. Marie Gold Biscuit"
                placeholderTextColor={colors.textSubtle}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                accessibilityLabel="Product name to search for"
                editable={!searching}
              />
              <Button
                label="Search"
                onPress={handleSearch}
                disabled={query.trim().length < 2 || searching}
                loading={searching}
                fullWidth={false}
                style={styles.searchButton}
              />
            </View>
          </Card>

          {searched && !searching && (
            <View style={styles.resultsSection}>
              {results.length === 0 ? (
                <Callout tone="warning" icon="information-circle-outline">
                  Nothing found for &ldquo;{query.trim()}&rdquo;. Scanning or typing the label is
                  the reliable route.
                </Callout>
              ) : (
                <>
                  <Text style={styles.resultsNote}>
                    Matched by name. Ingredients may differ from your pack if it is a newer
                    formulation — check the label before relying on it.
                  </Text>
                  {results.map(result => (
                    <Card
                      key={result.code}
                      style={styles.resultCard}
                      padded={false}
                    >
                      <Button
                        label={result.name}
                        variant="secondary"
                        fullWidth={false}
                        icon="arrow-forward"
                        loading={opening === result.code}
                        onPress={() => openProduct(result)}
                        style={styles.resultButton}
                      />
                      <View style={styles.resultMeta}>
                        {result.imageUrl ? (
                          <Image
                            source={{ uri: result.imageUrl }}
                            style={styles.resultImage}
                            accessibilityLabel=""
                          />
                        ) : null}
                        <View style={styles.resultText}>
                          {result.brands ? (
                            <Text style={styles.resultBrand} numberOfLines={1}>
                              {result.brands}
                            </Text>
                          ) : null}
                          <Text style={styles.resultCode}>{result.code}</Text>
                        </View>
                      </View>
                    </Card>
                  ))}
                </>
              )}
            </View>
          )}
        </View>

        <Callout tone="neutral" icon="information-circle-outline">
          Only Open Food Facts lookups need a network connection. Scanning or typing the
          ingredient label is analysed on this device and works offline.
        </Callout>

        <Button
          label="Back to scanner"
          variant="ghost"
          icon="arrow-back"
          onPress={() => navigation.back()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl },

  headerBlock: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.cautionSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },

  actionGroup: { gap: spacing.md },

  searchSection: { gap: 0 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, alignItems: 'center' },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  searchButton: { paddingHorizontal: spacing.lg },

  resultsSection: { gap: spacing.md, marginTop: spacing.lg },
  resultsNote: { ...typography.caption, color: colors.textMuted },
  resultCard: { padding: spacing.md, gap: spacing.md },
  resultButton: { alignSelf: 'flex-start' },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  resultImage: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSunken,
    resizeMode: 'contain',
  },
  resultText: { flex: 1 },
  resultBrand: { ...typography.captionStrong, color: colors.text },
  resultCode: {
    ...typography.caption,
    color: colors.textSubtle,
    fontVariant: ['tabular-nums'],
  },
});