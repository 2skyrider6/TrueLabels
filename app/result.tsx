import { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useResult } from '@/context/ResultContext';
import {
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  SectionHeading,
} from '@/components/ui';
import { colors, radii, shadows, spacing, toneColors, typography, verdictTone } from '@/theme/tokens';

/** Icon per verdict, so the outcome is recognisable before the word is read. */
const VERDICT_ICON = {
  safe: 'checkmark-circle' as const,
  caution: 'alert-circle' as const,
  unsafe: 'warning' as const,
  neutral: 'help-circle' as const,
};

export default function ResultScreen() {
  const { result } = useResult();
  const navigation = useRouter();
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);

  if (!result) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Ionicons name="scan-outline" size={26} color={colors.primary} />
        </View>
        <Text style={styles.centerTitle}>No scan to show</Text>
        <Text style={styles.centerMessage}>
          Scan a barcode or food label to see a verdict here.
        </Text>
        <Button
          label="Open scanner"
          icon="scan-outline"
          onPress={() => navigation.replace('/')}
          style={styles.centerButton}
        />
      </View>
    );
  }

  // An unreadable label must never render as a clean green result, however the
  // verdict happened to come out.
  const unreadable = result.insufficientData;
  const tone = unreadable ? 'neutral' : verdictTone(result.verdict);
  const palette = toneColors(tone);

  const verdictTitle = unreadable ? 'NOT READ' : result.verdict.toUpperCase();
  const verdictMessage = unreadable
    ? 'No ingredient text could be read from this label'
    : result.verdict === 'unsafe'
      ? 'Contains flagged allergens or restricted additives'
      : result.verdict === 'caution'
        ? 'Caution items or possible cross-contamination detected'
        : 'No flagged allergens or restricted additives found';

  const offUrl = result.offUrl || 'https://world.openfoodfacts.org';
  const declared = result.parsed.declaredAllergens;
  const mayContain = result.parsed.mayContain;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Verdict hero. The single strongest element on the screen. */}
      <View style={[styles.hero, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: palette.fg }]}>
          <Ionicons name={VERDICT_ICON[tone]} size={26} color={colors.textInverse} />
        </View>
        <Text style={[styles.heroTitle, { color: palette.fg }]} accessibilityRole="header">
          {verdictTitle}
        </Text>
        <Text style={styles.heroMessage}>{verdictMessage}</Text>

        {!unreadable && (
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{declared.length}</Text>
              <Text style={styles.heroStatLabel}>Declared</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{result.flags.length}</Text>
              <Text style={styles.heroStatLabel}>Flags</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{mayContain.length}</Text>
              <Text style={styles.heroStatLabel}>May contain</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* Product identity */}
        {(result.productName || result.barcode || result.imageUrl) && (
          <Card style={styles.productCard}>
            {result.imageUrl ? (
              <Image
                source={{ uri: result.imageUrl }}
                style={styles.productImage}
                accessibilityLabel={result.productName || 'Product image'}
              />
            ) : (
              <View style={[styles.productImage, styles.productImagePlaceholder]}>
                <Ionicons name="cube-outline" size={22} color={colors.textSubtle} />
              </View>
            )}
            <View style={styles.productDetails}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {result.productName || 'Unnamed product'}
              </Text>
              {result.brands ? (
                <Text style={styles.productBrand} numberOfLines={1}>
                  {result.brands}
                </Text>
              ) : null}
              <View style={styles.productMetaRow}>
                <Badge
                  label={sourceLabel(result.source)}
                  fg={colors.textSecondary}
                  bg={colors.surfaceSunken}
                  border={colors.border}
                />
                {result.barcode ? (
                  <Text style={styles.productBarcode}>{result.barcode}</Text>
                ) : null}
              </View>
            </View>
          </Card>
        )}

        {unreadable && (
          <Callout tone="warning" icon="alert-circle" title="Treat this result as unknown">
            No ingredient text was found, so no verdict can be trusted. Retake the photo with
            the ingredient list filling the frame and in focus, use Paste Ingredients to type
            it in, or check the pack yourself.
          </Callout>
        )}

        {/* Declared allergens. The most safety-critical block, so it comes first. */}
        {declared.length > 0 && (
          <View style={styles.section}>
            <SectionHeading
              eyebrow="From the pack"
              title="Allergens Declared"
              icon="alert-circle-outline"
              trailing={
                <Badge
                  label={String(declared.length)}
                  fg={palette.fg}
                  bg={palette.bg}
                  border={palette.border}
                />
              }
            />
            <Card>
              <View style={styles.chipWrap}>
                {declared.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    fg={colors.danger}
                    bg={colors.dangerSoft}
                    border={colors.dangerBorder}
                  />
                ))}
              </View>
              <Text style={styles.sectionNote}>
                The manufacturer declares these as present in the product.
              </Text>
            </Card>
          </View>
        )}

        {/* Why the verdict landed where it did */}
        <View style={styles.section}>
          <SectionHeading
            eyebrow="Analysis"
            title="What Drove the Verdict"
            icon="analytics-outline"
          />
          <Card padded={false}>
            {result.flags.length > 0 ? (
              result.flags.map((flag, index) => {
                const expanded = expandedFlag === flag.id;
                const flagTone = toneColors(flag.severity === 'unsafe' ? 'unsafe' : 'caution');
                return (
                  <Pressable
                    key={flag.id}
                    onPress={() => setExpandedFlag(expanded ? null : flag.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${flag.label}, ${flag.severity}. ${
                      expanded ? 'Hide details' : 'Show details'
                    }`}
                    style={({ pressed }) => [
                      styles.flagRow,
                      index > 0 && styles.flagRowDivider,
                      pressed && styles.flagRowPressed,
                    ]}
                  >
                    <View style={styles.flagRowHeader}>
                      <View style={[styles.flagDot, { backgroundColor: flagTone.fg }]} />
                      <Text style={styles.flagLabel}>{flag.label}</Text>
                      <Badge
                        label={flag.severity}
                        fg={flagTone.fg}
                        bg={flagTone.bg}
                        border={flagTone.border}
                      />
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textSubtle}
                      />
                    </View>
                    {flag.crossContamination ? (
                      <View style={styles.flagTagRow}>
                        <Badge
                          label="Cross-contamination"
                          icon="git-branch-outline"
                          fg={colors.primary}
                          bg={colors.primarySoft}
                          border={colors.primaryBorder}
                        />
                      </View>
                    ) : null}
                    {expanded ? <Text style={styles.flagReason}>{flag.reason}</Text> : null}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.flagEmpty}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={unreadable ? colors.textSubtle : colors.safe}
                  style={styles.flagEmptyIcon}
                />
                <Text style={[styles.flagEmptyText, unreadable && styles.flagEmptyTextMuted]}>
                  {unreadable
                    ? 'Nothing to analyse — the label was not read'
                    : 'No triggering ingredients found'}
                </Text>
              </View>
            )}
          </Card>
        </View>

        {/* Traces */}
        <View style={styles.section}>
          <SectionHeading
            eyebrow="Cross-contamination"
            title="May Contain"
            icon="information-circle-outline"
          />
          <Card>
            {mayContain.length > 0 ? (
              <>
                <View style={styles.chipWrap}>
                  {mayContain.map((item) => (
                    <Chip
                      key={item}
                      label={item}
                      fg={colors.caution}
                      bg={colors.cautionSoft}
                      border={colors.cautionBorder}
                    />
                  ))}
                </View>
                <Text style={styles.sectionNote}>
                  The label warns these may be present through shared equipment.
                </Text>
              </>
            ) : (
              <Text style={styles.emptyLine}>No &ldquo;may contain&rdquo; items detected</Text>
            )}
          </Card>
        </View>

        {/* Veg mark: stated plainly rather than presented as an empty result. */}
        <View style={styles.section}>
          <SectionHeading eyebrow="Pack marking" title="Veg / Non-Veg Mark" icon="leaf-outline" />
          <Callout tone="neutral" icon="leaf-outline">
            Not analysed. Reading the green or brown veg mark needs on-device image
            recognition this app does not perform, so nothing is inferred from the photo. The
            ingredient analysis above is the authoritative signal.
          </Callout>
        </View>

        {/* Verbatim source text */}
        <View style={styles.section}>
          <SectionHeading eyebrow="Source" title="Raw Ingredient Text" icon="document-text-outline" />
          <Card>
            <Text style={styles.rawText} selectable>
              {result.rawIngredients || 'No ingredients text provided'}
            </Text>
            <Text style={styles.rulesetNote}>Ruleset {result.rulesetVersion}</Text>
          </Card>
        </View>

        {result.source === 'barcode' && result.offAttribution && (
          <Pressable
            onPress={() => Linking.openURL(offUrl)}
            accessibilityRole="link"
            accessibilityLabel="View this product on openfoodfacts.org"
            style={({ pressed }) => [styles.attribution, pressed && styles.flagRowPressed]}
          >
            <View style={styles.attributionIcon}>
              <Ionicons name="open-outline" size={16} color={colors.primary} />
            </View>
            <View style={styles.attributionBody}>
              <Text style={styles.attributionTitle}>Product data from Open Food Facts</Text>
              <Text style={styles.attributionLink}>View on openfoodfacts.org</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>
        )}

        <Callout tone="warning" icon="information-circle-outline">
          This analysis is an ingredient scan for informational purposes, not medical advice.
          Always read the full label and consult a healthcare professional for dietary or
          allergen requirements.
        </Callout>

        <View style={styles.actions}>
          <Button label="Scan another item" icon="scan-outline" onPress={() => navigation.replace('/')} />
          <Button
            label="View history"
            variant="secondary"
            icon="time-outline"
            onPress={() => navigation.push('/history')}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function sourceLabel(source: string) {
  switch (source) {
    case 'barcode':
      return 'Barcode';
    case 'label':
      return 'Label photo';
    default:
      return 'Typed';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: spacing.huge },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xxl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  centerTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.xs },
  centerMessage: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  centerButton: { alignSelf: 'stretch' },

  hero: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    alignItems: 'center',
    ...shadows.card,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { ...typography.verdict },
  heroMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,24,39,0.08)',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { ...typography.title, color: colors.text },
  heroStatLabel: {
    ...typography.overline,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(17,24,39,0.08)' },

  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },

  productCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken,
    resizeMode: 'contain',
  },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productDetails: { flex: 1 },
  productTitle: { ...typography.subheading, color: colors.text },
  productBrand: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  productBarcode: {
    ...typography.caption,
    color: colors.textSubtle,
    fontVariant: ['tabular-nums'],
  },

  section: { gap: 0 },

  flagRow: { padding: spacing.lg },
  flagRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  flagRowPressed: { backgroundColor: colors.surfaceSunken },
  flagRowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flagDot: { width: 8, height: 8, borderRadius: radii.pill },
  flagLabel: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  flagTagRow: { flexDirection: 'row', marginTop: spacing.sm, paddingLeft: 16 },
  flagReason: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  flagEmpty: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  flagEmptyIcon: { marginTop: 1 },
  flagEmptyText: { ...typography.body, color: colors.safe, flex: 1 },
  flagEmptyTextMuted: { color: colors.textMuted },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
  emptyLine: { ...typography.body, color: colors.textMuted },

  rawText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  rulesetNote: {
    ...typography.overline,
    color: colors.textSubtle,
    marginTop: spacing.lg,
  },

  attribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  attributionIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attributionBody: { flex: 1 },
  attributionTitle: { ...typography.captionStrong, color: colors.text },
  attributionLink: { ...typography.caption, color: colors.primary, marginTop: 1 },

  actions: { gap: spacing.md },
});