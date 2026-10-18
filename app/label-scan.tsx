import { CameraView } from 'expo-camera';
import type { RecognitionResult } from 'expo-mlkit-ocr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { useResult } from '@/context/ResultContext';
import { useHaptic } from '@/hooks/useHaptic';
import {
  recognizeOrchestrated,
} from '@/ocr/orchestrator';
import { extractIngredientSection, isOcrSupported } from '@/ocr/recognize';
import { loadRuleset } from '@/rules/engine';
import { isRulesetReadable } from '@/ai/scripts';
import { analyzeOrchestrated } from '@/ai/analyze-orchestrated';
import { Button, Callout, IconButton } from '@/components/ui';
import { colors, radii, shadows, spacing, typography } from '@/theme/tokens';

const ruleset = loadRuleset();

export default function LabelScanScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  /** Whether the text in `ocrText` came from a located ingredient list. */
  const [ocrFoundHeader, setOcrFoundHeader] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [ocrSupported, setOcrSupported] = useState<boolean | null>(null);
  const { hasPermission, hasCameraPermission, requestPermission } = useCameraPermission();
  const navigation = useRouter();
  const { setResult } = useResult();
  const { trigger: haptic } = useHaptic();

  const cameraViewRef = useRef<any>(null);
  const permissionRequestedRef = useRef(false);

  /**
   * Whether this text is in a language the rule set cannot read. Worth telling the
   * user about, because it is why the result will be reported as NOT VERIFIED
   * rather than as a verdict they should trust.
   */
  const wouldBeUnreadable = useMemo(
    () => (ocrText.trim() ? !isRulesetReadable(ocrText) : false),
    [ocrText]
  );

  // Ask for camera access exactly once, on mount.
  useEffect(() => {
    if (permissionRequestedRef.current) return;
    permissionRequestedRef.current = true;
    requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    let cancelled = false;
    isOcrSupported()
      .then(supported => {
        if (!cancelled) setOcrSupported(supported);
      })
      .catch(() => {
        if (!cancelled) setOcrSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runOcr = useCallback(async (uri: string) => {
    setProcessing(true);
    try {
      const ocrResult = await recognizeOrchestrated(uri);
      const recognitionResult: RecognitionResult = {
        text: ocrResult.text,
        blocks: [],
      };
      const section = extractIngredientSection(recognitionResult);
      setOcrText(section.text);
      setOcrConfidence(ocrResult.confidence);
      // Remembered so an Analyze run on this OCR text is not mistaken for a
      // readable ingredient list when it was really just unrelated pack text.
      setOcrFoundHeader(section.foundHeader && ocrResult.headerFound);
      if (!section.text.trim() || !section.foundHeader) {
        Alert.alert(
          'Ingredients Not Found',
          'No ingredient list could be located in this photo. Retake it with the ingredient panel filling the frame, or type or paste the ingredients below.'
        );
      }
    } catch (error) {
      console.error('OCR error:', error);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('development build')) {
        Alert.alert(
          'Development Build Required',
          'OCR requires a development build. It does not work in Expo Go. Please run `eas build --profile development` and install the app on a device.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('OCR Error', 'Failed to recognize text. You can type the text below.');
      }
    } finally {
      setProcessing(false);
    }
  }, []);

  // Recognition is kicked off from the capture handler rather than from an
  // effect, so setting the photo and starting OCR happen in one user action
  // instead of via a cascading render.
  const takePicture = useCallback(async () => {
    if (!cameraViewRef.current) return;
    haptic('medium');
    setProcessing(true);
    try {
      const result = await cameraViewRef.current.takePictureAsync({ quality: 0.85 });
      if (result?.uri) {
        setImageUri(result.uri);
        setOcrText('');
        setOcrFoundHeader(false);
        await runOcr(result.uri);
      }
    } catch (error) {
      console.error('Failed to take picture:', error);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [runOcr, haptic]);

  const handleAnalyze = useCallback(
    async (text: string, fromOcr: boolean = false) => {
      if (!text.trim()) {
        haptic('error');
        Alert.alert('No Text', 'Please enter or capture ingredient text.');
        return;
      }

      haptic('light');
      setProcessing(true);
      try {
        // Analysis runs the orchestrated pipeline: fuzzy rule matching with
        // confidence scoring on the OCR text we already captured.
        const outcome = await analyzeOrchestrated(imageUri ?? '', {
          ruleset,
          foundHeader: fromOcr ? ocrFoundHeader : true,
          ocrResult: {
            text: ocrText,
            confidence: ocrConfidence ?? 0.5,
            passes: [],
            headerFound: ocrFoundHeader,
            bestImageUri: imageUri ?? '',
          },
        });

        setResult({
          source: 'label',
          // Kept so the photo is copied out of the cache and shown in history.
          imageUrl: imageUri ?? undefined,
          rawIngredients: text,
          parsed: outcome.parsed,
          flags: outcome.result.flags.map(f => ({
            id: f.id,
            severity: f.severity,
            label: f.label,
            reason: f.reason,
            category: f.category,
            crossContamination: f.crossContamination,
            confidence: f.confidence,
            matchType: f.matchType,
            matchedTerm: f.matchedTerm,
          })),
          verdict: outcome.result.verdict,
          insufficientData: outcome.result.insufficientData,
          coverage: outcome.coverage,
          analysisSource: outcome.source,
          aiProvenance: outcome.provenance,
          // Veg/non-veg marks need a native vision module that is not available
          // yet, so this is always 'unknown' rather than a guess.
          vegMark: 'unknown',
          offAttribution: false,
          createdAt: new Date().toISOString(),
          rulesetVersion: ruleset.rulesetVersion,
          ocrConfidence: outcome.ocrConfidence,
        });
        navigation.replace('/result');
      } catch (error) {
        console.error('Analysis error:', error);
        Alert.alert('Error', 'Failed to analyze ingredients. Please try again.');
      } finally {
        setProcessing(false);
      }
    },
    [imageUri, navigation, ocrFoundHeader, ocrText, ocrConfidence, setResult, haptic]
  );

  const retake = useCallback(() => {
    setImageUri(null);
    setOcrText('');
    setOcrFoundHeader(false);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          Scan the label
        </Text>
        <Text style={styles.subtitle}>
          Fill the frame with the ingredient panel, hold steady, and check the text before
          analysing.
        </Text>
      </View>

      {ocrSupported === false && (
        <Callout tone="warning" icon="alert-circle" title="Development build required">
          OCR does not run in Expo Go. Install an EAS development build to read labels from a
          photo, or use Type ingredients instead.
        </Callout>
      )}

      {hasPermission === null ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.statusText}>Requesting camera permission…</Text>
        </View>
      ) : !hasCameraPermission ? (
        <View style={styles.deniedBlock}>
          <View style={styles.deniedIcon}>
            <Ionicons name="lock-closed-outline" size={22} color={colors.danger} />
          </View>
          <Text style={styles.deniedTitle}>Camera access denied</Text>
          <Text style={styles.deniedText}>
            TrueLabels needs the camera to photograph the ingredient panel.
          </Text>
          <Button
            label="Grant camera access"
            variant="secondary"
            icon="camera-outline"
            onPress={() => requestPermission()}
          />
        </View>
      ) : (
        <>
          <View style={styles.previewCard}>
            {imageUri ? (
              <View style={styles.previewImageWrap}>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.imagePreview}
                  accessibilityLabel="Captured food label"
                />
                <View style={styles.retakeSlot}>
                  <IconButton
                    icon="refresh"
                    onPress={retake}
                    accessibilityLabel="Retake photo"
                    variant="inverse"
                    disabled={processing}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.cameraWrap}>
                <CameraView
                  ref={cameraViewRef}
                  style={styles.cameraView}
                  enableTorch={torchOn}
                  facing="back"
                />

                {/* Torch toggle. Small print and glare on a pack are the main
                    cause of failed OCR, so this sits directly on the preview. */}
                <View style={styles.torchSlot}>
                  <IconButton
                    icon={torchOn ? 'flashlight' : 'flashlight-outline'}
                    onPress={() => setTorchOn(prev => !prev)}
                    accessibilityLabel={torchOn ? 'Turn flash off' : 'Turn flash on'}
                    variant="inverse"
                    disabled={processing}
                  />
                </View>

                <View style={styles.cameraHint} pointerEvents="none">
                  <Ionicons name="text-outline" size={15} color={colors.onCamera} style={styles.cameraHintIcon} />
                  <Text style={styles.cameraHintText}>Keep the ingredient list flat and in focus</Text>
                </View>

                {/* Corner brackets in the safety green, per the design system's
                    OCR viewfinder treatment. */}
                <View style={styles.reticle} pointerEvents="none">
                  <View style={[styles.reticleCorner, styles.cornerTopLeft]} />
                  <View style={[styles.reticleCorner, styles.cornerTopRight]} />
                  <View style={[styles.reticleCorner, styles.cornerBottomLeft]} />
                  <View style={[styles.reticleCorner, styles.cornerBottomRight]} />
                </View>
              </View>
            )}
          </View>

          {!imageUri && (
            <Button
              label="Take photo"
              icon="camera-outline"
              onPress={takePicture}
              loading={processing}
              disabled={processing}
            />
          )}

          {imageUri && !ocrText && (
            <Button
              label="Read text"
              icon="scan-outline"
              onPress={() => imageUri && runOcr(imageUri)}
              loading={processing}
              disabled={processing}
            />
          )}

          {imageUri && (
            <View style={styles.editorGroup}>
              <View style={styles.editorHeading}>
                <Text style={styles.fieldLabel}>Recognised text</Text>
                <Text style={styles.fieldHint}>Edit anything the camera got wrong</Text>
              </View>
              <View style={styles.editor}>
                <TextInput
                  style={styles.textInput}
                  value={ocrText}
                  onChangeText={setOcrText}
                  multiline
                  editable={!processing}
                  textAlignVertical="top"
                  placeholder="No text recognised yet…"
                  placeholderTextColor={colors.textSubtle}
                  accessibilityLabel="Recognized ingredients text"
                />
                {ocrText.length > 0 && (
              <View style={styles.editorFooter}>
                <Text style={styles.charCount}>
                  {ocrText.trim().split(/[,\n]/).filter(s => s.trim()).length} items
                </Text>
                {ocrConfidence !== null && (
                  <Text style={[styles.ocrConfidence, ocrConfidence < 0.7 && styles.ocrConfidenceLow]}>
                    OCR confidence: {Math.round(ocrConfidence * 100)}%
                  </Text>
                )}
                {!ocrFoundHeader && (
                  <Text style={styles.unverifiedNote}>Ingredient list not located</Text>
                )}
              </View>
                )}
              </View>

              {/* Worth saying before the user invests in a photo they cannot verify. Nothing
                  is being sent anywhere, so there is no cheaper fallback to offer. */}
              {!processing && wouldBeUnreadable && (
                <Callout tone="warning" icon="alert-circle-outline" title="Language not covered">
                  This label appears to be written in a language TrueLabels cannot read yet.
                  You will still get a result, but it will be marked NOT VERIFIED rather than
                  confirmed. Check the pack for allergens yourself.
                </Callout>
              )}

              <Button
                label={wouldBeUnreadable ? 'Analyse anyway' : 'Analyse ingredients'}
                icon="search-outline"
                onPress={() => handleAnalyze(ocrText, true)}
                disabled={!ocrText.trim() || processing}
                loading={processing}
              />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.xl },

  intro: { gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  statusText: { ...typography.body, color: colors.textMuted },

  deniedBlock: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  deniedIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedTitle: { ...typography.heading, color: colors.text },
  deniedText: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  previewCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.scrim,
    ...shadows.raised,
  },
  cameraWrap: { height: 300, position: 'relative' },
  cameraView: { flex: 1 },
  cameraHint: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlay,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  cameraHintIcon: { marginTop: 1 },
  cameraHintText: { ...typography.caption, color: colors.onCamera },
  torchSlot: { position: 'absolute', top: spacing.md, right: spacing.md },

  // Viewfinder brackets: emerald corners over the darkened camera backdrop.
  reticle: { position: 'absolute', top: '12%', left: '8%', right: '8%', height: '60%' },
  reticleCorner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.safe,
  },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  previewImageWrap: { height: 300, position: 'relative' },
  imagePreview: { width: '100%', height: '100%', resizeMode: 'contain', backgroundColor: colors.scrim },
  retakeSlot: { position: 'absolute', bottom: spacing.md, right: spacing.md },

  editorGroup: { gap: spacing.md },
  editorHeading: { gap: 2 },
  fieldLabel: { ...typography.overline, color: colors.textSubtle },
  fieldHint: { ...typography.caption, color: colors.textMuted },

  editor: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  textInput: {
    minHeight: 170,
    padding: spacing.lg,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    textAlignVertical: 'top',
  },
  editorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  charCount: { ...typography.caption, color: colors.textMuted },
  unverifiedNote: { ...typography.captionStrong, color: colors.caution },
  ocrConfidence: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xxs },
  ocrConfidenceLow: { color: colors.caution },
});