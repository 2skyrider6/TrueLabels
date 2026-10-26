import { useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useResult } from '@/context/ResultContext';
import { useHaptic } from '@/hooks/useHaptic';
import {
  AdditivePill,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  DietaryBadge,
  ProductSafetyCard,
  SafetyMeter,
  SectionHeading,
} from '@/components/ui';
import { AnimatedButton, SlideUp, ScaleIn } from '@/components/animated';
import { colors, radii, shadows, spacing, toneColors, typography } from '@/theme/tokens';
import { presentVerdict, safetyScore } from '@/ai/merge';

/** Icon per verdict, so the outcome is recognisable before the word is read. */
const VERDICT_ICON = {
  safe: 'checkmark-circle' as const,
  caution: 'alert-circle' as const,
  unsafe: 'warning' as const,
  neutral: 'help-circle' as const,
};

/**
 * Pulls an INS code out of an additive flag's label, e.g. "INS 330 · Citric
 * Acid" -> code "INS 330", descriptor "Citric Acid".
 *
 * Returns null when the label carries no code, in which case the flag is
 * rendered as an ordinary row rather than a misleading monospace pill.
 */
function parseIns(label: string): { code: string; descriptor: string } | null {
  const match = /^(INS\s*\d+[a-z]?)\s*(?:[·\-–:]\s*(.+))?$/i.exec(label.trim());
  if (!match) return null;
  return {
    code: match[1].replace(/\s+/g, ' ').trim(),
    descriptor: (match[2] ?? 'Additive').trim(),
  };
}

export default function ResultScreen() {
  const { result } = useResult();
  const navigation = useRouter();
  const { trigger: haptic } = useHaptic();
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

  // A verdict is only ever presented as a clean bill of health when the pipeline
  // can justify it. `presentVerdict` is the single gate for that decision: it
  // forces NOT READ for an unreadable label and NOT VERIFIED for one written in a
  // language the offline rule set cannot read, regardless of what the engine
  // concluded.
  const coverage = result.coverage ?? 'unverified';
  const presentation = presentVerdict(result.verdict, coverage, result.insufficientData);
  const unverified = !presentation.verdictTrusted;
  const unreadable = result.insufficientData;

  const tone = presentation.tone;
  const palette = toneColors(tone);

  const verdictTitle = presentation.title;
  const verdictMessage = unreadable
    ? 'No ingredient text could be read from this label'
    : coverage === 'unverified'
      ? 'This label is in a language the offline rules cannot read, so no verdict has been confirmed'
      : result.verdict === 'unsafe'
        ? 'Contains flagged allergens or restricted additives'
        : result.verdict === 'caution'
          ? 'Caution items or possible cross-contamination detected'
          : 'No flagged allergens or restricted additives found';

  const offUrl = result.offUrl || 'https://world.openfoodfacts.org';
  const declared = result.parsed.declaredAllergens;
  const mayContain = result.parsed.mayContain;

  // Derived presentation score. The verdict above remains authoritative; the
  // meter only visualises it, and `safetyScore` holds an unreadable or
  // unverified label in the critical band so it can never read as a pass.
  const score = safetyScore({
    verdict: result.verdict,
    coverage,
    insufficientData: unreadable,
    flagCount: result.flags.length,
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Verdict hero. The single strongest element on the screen. */}
      <ScaleIn delay={0}>
        <View style={[styles.hero, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: palette.fg }]}>
            <Ionicons name={VERDICT_ICON[tone]} size={26} color={colors.textInverse} />
          </View>
          <Text style={[styles.heroTitle, { color: palette.fg }]} accessibilityRole="header">
            {verdictTitle}
          </Text>
          <Text style={styles.heroMessage}>{verdictMessage}</Text>

          {/* OCR confidence indicator */}
          {result.ocrConfidence !== null && result.ocrConfidence !== undefined && (
            <View style={styles.ocrConfidenceRow}>
              <Ionicons name="scan-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.ocrConfidenceText, result.ocrConfidence < 0.7 && styles.ocrConfidenceLow]}>
                OCR confidence: {Math.round(result.ocrConfidence * 100)}%
              </Text>
            </View>
          )}

          {/* Safety meter. The score is only shown once the verdict is trusted,
              so a NOT VERIFIED label never displays a number that reads as a
              clean bill of health. */}
          {!unverified && (
            <View style={styles.heroMeter}>
              <SafetyMeter score={score} height={10} />
            </View>
          )}

          {!unverified && (
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
      </ScaleIn>

      <View style={styles.content}>
        {/* Product identity */}
        <SlideUp delay={100}>
          {(result.productName || result.barcode || result.imageUrl) && (
            <ProductSafetyCard
              score={unverified ? undefined : score}
              title={result.productName || 'Unnamed product'}
              brand={result.brands}
              imageUrl={result.imageUrl}
              vegMark={result.vegMark}
              barcode={result.barcode}
            >
              <Badge
                label={sourceLabel(result.source)}
                fg={colors.textSecondary}
                bg={colors.surfaceSunken}
                border={colors.border}
              />
            </ProductSafetyCard>
          )}
        </SlideUp>

        {unreadable && (
          <Callout tone="warning" icon="alert-circle" title="Treat this result as unknown">
            No ingredient text was found, so no verdict can be trusted. Retake the photo with
            the ingredient list filling the frame and in focus, use Paste Ingredients to type
            it in, or check the pack yourself.
          </Callout>
        )}

        {coverage === 'unverified' && !unreadable && (
          <Callout tone="warning" icon="alert-circle" title="No verdict has been confirmed">
            The rule set in TrueLabels could not read the language of this label. Nothing here
            has been cleared as safe. Check the pack for allergens yourself, or paste the
            ingredients as text to analyse them without the camera.
          </Callout>
        )}

        {/* Declared allergens. The most safety-critical block, so it comes first. */}
        <SlideUp delay={150}>
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
        </SlideUp>

        {/* Why the verdict landed where it did */}
        <SlideUp delay={200}>
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
                  // Additive flags that carry an INS code get the monospace
                  // pill treatment; everything else stays an ordinary row.
                  const ins = flag.category === 'additive' ? parseIns(flag.label) : null;
                  const pillTone = flag.severity === 'unsafe' ? 'unsafe' : 'caution';
                  return (
                    <AnimatedButton
                      key={flag.id}
                      onPress={() => {
                        haptic('selection');
                        setExpandedFlag(expanded ? null : flag.id);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${flag.label}, ${flag.severity}. ${
                        expanded ? 'Hide details' : 'Show details'
                      }`}
                      style={[styles.flagRow, index > 0 && styles.flagRowDivider]}
                    >
                      <View style={styles.flagRowHeader}>
                        <View style={[styles.flagDot, { backgroundColor: flagTone.fg }]} />
                      {ins ? (
                        <AdditivePill
                          code={ins.code}
                          descriptor={ins.descriptor}
                          tone={pillTone}
                        />
                      ) : (
                        <Text style={styles.flagLabel}>{flag.label}</Text>
                      )}
                      {flag.matchType && flag.matchType !== 'exact' && (
                        <Text style={[styles.flagMatchType, flag.matchType === 'fuzzy' && styles.flagMatchTypeFuzzy]}>
                          {flag.matchType === 'fuzzy' ? '~' : '≈'}
                        </Text>
                      )}
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
                    </AnimatedButton>
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
        </SlideUp>

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
          <Card>
            <View style={styles.vegRow}>
              <DietaryBadge mark={result.vegMark} />
              <View style={styles.vegBody}>
                <Text style={styles.vegTitle}>
                  {result.vegMark === 'veg'
                    ? 'Vegetarian mark detected'
                    : result.vegMark === 'non-veg'
                      ? 'Non-vegetarian mark detected'
                      : 'Mark not analysed'}
                </Text>
                <Text style={styles.vegNote}>
                  Not analysed. Reading the green or brown veg mark needs on-device image
                  recognition this app does not perform, so nothing is inferred from the photo.
                  The ingredient analysis above is the authoritative signal.
                </Text>
              </View>
            </View>
          </Card>
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

        <SlideUp delay={300}>
          <View style={styles.actions}>
            <Button label="Scan another item" icon="scan-outline" onPress={() => navigation.replace('/')} />
            <Button
              label="View history"
              variant="secondary"
              icon="time-outline"
              onPress={() => navigation.push('/history')}
            />
          </View>
        </SlideUp>
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
  ocrConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  ocrConfidenceText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  ocrConfidenceLow: {
    color: colors.caution,
  },
  heroMeter: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: 'rgba(30, 62, 98, 0.10)',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { ...typography.title, color: colors.text },
  heroStatLabel: {
    ...typography.overline,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(30, 62, 98, 0.10)' },

  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },

  vegRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  vegBody: { flex: 1, gap: spacing.xxs },
  vegTitle: { ...typography.bodyStrong, color: colors.text },
  vegNote: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },

  section: { gap: 0 },

  flagRow: { padding: spacing.lg },
  flagRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  flagRowPressed: { backgroundColor: colors.surfaceSunken },
  flagRowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flagDot: { width: 8, height: 8, borderRadius: radii.pill },
  flagLabel: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  flagMatchType: {
    ...typography.caption,
    color: colors.textSubtle,
    marginLeft: spacing.xs,
  },
  flagMatchTypeFuzzy: {
    color: colors.caution,
  },
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
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
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