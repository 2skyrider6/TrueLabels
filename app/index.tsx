import { CameraView } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { useResult } from '@/context/ResultContext';
import { fetchProductByBarcode, isProductBarcode } from '@/off/client';
import { parseIngredients } from '@/rules/parser';
import { evaluateEngine, loadRuleset } from '@/rules/engine';
import { Button, Callout, ScreenHeader } from '@/components/ui';
import { HIT_SIZE, colors, radii, shadows, spacing, typography } from '@/theme/tokens';

// Loaded once: the ruleset is a bundled JSON module and is validated on load.
const ruleset = loadRuleset();

export default function HomeScreen() {
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const scannedRef = useRef<string | null>(null);
  const rejectedRef = useRef<string | null>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const navigation = useRouter();
  const { setResult } = useResult();
  const insets = useSafeAreaInsets();

  const onCameraReady = useCallback(() => {
    setCameraReady(true);
  }, []);

  const processBarcode = useCallback(
    async (barcode: string) => {
      if (scannedRef.current === barcode) return;
      scannedRef.current = barcode;
      setLastScannedCode(barcode);
      setScanning(true);

      Vibration.vibrate(50);

      const allowRetry = () => {
        scannedRef.current = null;
        rejectedRef.current = null;
      };

      try {
        const { product, needsIngredients } = await fetchProductByBarcode(barcode);

        // Neither a barcode miss nor a missing ingredient list can be resolved
        // from the camera view, so both leave the scanner and explain why.
        if (!product || needsIngredients) {
          Vibration.vibrate([0, 100, 50, 100]);
          setScanning(false);
          navigation.push({
            pathname: '/not-found',
            params: {
              barcode,
              productName: product?.product_name ?? '',
              reason: product ? 'ingredients' : 'barcode',
            },
          });
          return;
        }

        const rawIngredients = product.ingredients_text || '';

        const parsed = parseIngredients(rawIngredients);
        const { flags, verdict, insufficientData } = evaluateEngine(parsed, ruleset);

        setResult({
          source: 'barcode',
          barcode,
          productName: product.product_name,
          brands: product.brands,
          imageUrl: product.image_front_url,
          rawIngredients,
          parsed,
          flags,
          verdict,
          insufficientData,
          vegMark: 'unknown',
          offAttribution: true,
          offUrl: `https://world.openfoodfacts.org/product/${barcode}`,
          createdAt: new Date().toISOString(),
          rulesetVersion: ruleset.rulesetVersion,
        });
        navigation.replace('/result');
      } catch (error) {
        console.error('Barcode processing error:', error);
        Vibration.vibrate([0, 100, 50, 100]);
        Alert.alert(
          'Error',
          'Failed to process barcode. Please try again or scan the label.',
          [{ text: 'OK', onPress: allowRetry }]
        );
      } finally {
        setScanning(false);
      }
    },
    [navigation, setResult]
  );

  const handleBarcodeScanned = useCallback(
    (event: { type: string; data: string }) => {
      if (scanning || !cameraReady) return;
      const code = event.data?.trim();
      if (!code) return;

      // QR and DataMatrix payloads are arbitrary text, not GTIN/EAN/UPC codes.
      if (!isProductBarcode(code)) {
        if (rejectedRef.current !== code) {
          rejectedRef.current = code;
          Alert.alert(
            'Not a product barcode',
            'That code is not a 8-14 digit product barcode. Scan the barcode on the pack, or use Scan Label to read the ingredients.'
          );
        }
        return;
      }

      if (scannedRef.current === code) return;
      processBarcode(code);
    },
    [scanning, cameraReady, processBarcode]
  );

  const toggleTorch = useCallback(() => {
    setTorchOn(prev => !prev);
  }, []);

  const handleManualEntry = useCallback(() => {
    const barcode = barcodeInput.trim();
    if (/^\d{8,14}$/.test(barcode)) {
      processBarcode(barcode);
    } else {
      Alert.alert('Invalid Barcode', 'Please enter a valid 8-14 digit barcode.');
    }
  }, [barcodeInput, processBarcode]);

  const manualSubmitDisabled = scanning || !/^\d{8,14}$/.test(barcodeInput.trim());

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="TrueLabels"
          subtitle="Check what is really in the pack"
          trailing={
            <Pressable
              onPress={() => navigation.push('/history')}
              accessibilityRole="button"
              accessibilityLabel="Open scan history"
              hitSlop={8}
              style={({ pressed }) => [styles.historyButton, pressed && styles.pressed]}
            >
              <Ionicons name="time-outline" size={18} color={colors.text} />
            </Pressable>
          }
        />
      </View>

      <View style={styles.body}>
        {hasPermission === null ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>Requesting camera permission…</Text>
          </View>
        ) : hasPermission ? (
          <>
            <View style={styles.cameraCard}>
              <View style={styles.cameraFrame}>
                <CameraView
                  style={styles.cameraView}
                  onBarcodeScanned={handleBarcodeScanned}
                  onCameraReady={onCameraReady}
                  enableTorch={torchOn}
                  barcodeScannerSettings={{
                    barcodeTypes: [
                      'ean13',
                      'ean8',
                      'upc_a',
                      'upc_e',
                      'code128',
                      'code39',
                      'code93',
                      'itf14',
                      'codabar',
                      'qr',
                      'datamatrix',
                      'pdf417',
                      'aztec',
                    ],
                  }}
                />

                {/* Corner-bracket reticle, drawn over the preview. */}
                <View style={styles.reticle} pointerEvents="none">
                  <View style={[styles.corner, styles.cornerTopLeft]} />
                  <View style={[styles.corner, styles.cornerTopRight]} />
                  <View style={[styles.corner, styles.cornerBottomLeft]} />
                  <View style={[styles.corner, styles.cornerBottomRight]} />
                </View>

                <View style={styles.viewfinderHint} pointerEvents="none">
                  <Text style={styles.viewfinderHintText}>Align the barcode inside the frame</Text>
                </View>

                {!cameraReady && (
                  <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={colors.onCamera} />
                    <Text style={styles.overlayText}>Starting camera…</Text>
                  </View>
                )}

                {scanning && (
                  <View style={styles.overlay}>
                    <ActivityIndicator size="large" color={colors.onCamera} />
                    <Text style={styles.overlayText}>Looking up product…</Text>
                  </View>
                )}
              </View>

              <View style={styles.cameraFooter}>
                <View style={styles.cameraStatus}>
                  <Ionicons
                    name={cameraReady ? 'radio-button-on' : 'radio-button-off'}
                    size={12}
                    color={cameraReady ? colors.safe : colors.textSubtle}
                    style={styles.cameraStatusIcon}
                  />
                  <Text style={styles.cameraStatusText} numberOfLines={1}>
                    {lastScannedCode ? `Last scanned ${lastScannedCode}` : 'Scanner ready'}
                  </Text>
                </View>
                <Pressable
                  onPress={toggleTorch}
                  disabled={scanning || !cameraReady}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle torch"
                  accessibilityState={{ disabled: scanning || !cameraReady, selected: torchOn }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.torchButton,
                    torchOn && styles.torchButtonActive,
                    (scanning || !cameraReady) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={torchOn ? 'flashlight' : 'flashlight-outline'}
                    size={16}
                    color={torchOn ? colors.textInverse : colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Barcode number</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="8–14 digits"
                  placeholderTextColor={colors.textSubtle}
                  value={barcodeInput}
                  onChangeText={setBarcodeInput}
                  keyboardType="numeric"
                  maxLength={14}
                  accessibilityLabel="Barcode number"
                />
                <Button
                  label="Look up"
                  onPress={handleManualEntry}
                  disabled={manualSubmitDisabled}
                  fullWidth={false}
                  style={styles.lookupButton}
                />
              </View>
            </View>
          </>
        ) : (
          <Callout tone="warning" title="Camera access denied" icon="lock-closed-outline">
            Enable camera permission in Settings to scan barcodes and food labels.
          </Callout>
        )}

        {hasPermission === false && (
          <Button
            label="Retry permission"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => requestPermission()}
          />
        )}

        {/* Alternate entry points. */}
        <View style={styles.altGroup}>
          <Text style={styles.altHeading}>Or check by label</Text>
          <Pressable
            onPress={() => navigation.push('/label-scan')}
            disabled={!hasPermission || scanning}
            accessibilityRole="button"
            accessibilityLabel="Scan a food label using the camera and OCR"
            accessibilityState={{ disabled: !hasPermission || scanning }}
            style={({ pressed }) => [
              styles.altButton,
              (!hasPermission || scanning) && styles.altButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.altIcon}>
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.altBody}>
              <Text style={styles.altTitle}>Scan label</Text>
              <Text style={styles.altSubtitle}>Photograph the ingredient panel and read it</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>

          <Pressable
            onPress={() => navigation.push('/paste')}
            disabled={scanning}
            accessibilityRole="button"
            accessibilityLabel="Paste ingredients text"
            accessibilityState={{ disabled: scanning }}
            style={({ pressed }) => [
              styles.altButton,
              scanning && styles.altButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.altIcon}>
              <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.altBody}>
              <Text style={styles.altTitle}>Type ingredients</Text>
              <Text style={styles.altSubtitle}>Paste the text when a photo is not readable</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },

  historyButton: {
    width: HIT_SIZE,
    height: HIT_SIZE,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },

  stateBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateText: { ...typography.body, color: colors.textMuted },

  cameraCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.raised,
  },
  cameraFrame: { height: 300, backgroundColor: colors.scrim },
  cameraView: { flex: 1 },

  reticle: { position: 'absolute', top: '26%', left: '14%', right: '14%', height: '48%' },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: colors.onCamera },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 6,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 6,
  },

  viewfinderHint: {
    position: 'absolute',
    bottom: spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  viewfinderHintText: {
    ...typography.caption,
    color: colors.onCameraMuted,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayStrong,
  },
  overlayText: { ...typography.body, color: colors.onCamera, marginTop: spacing.md },

  cameraFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  cameraStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  cameraStatusIcon: { marginTop: 1 },
  cameraStatusText: { ...typography.caption, color: colors.textMuted, flex: 1 },

  torchButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  torchButtonActive: { backgroundColor: colors.primary },

  fieldGroup: { gap: spacing.sm },
  fieldLabel: { ...typography.overline, color: colors.textSubtle },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: HIT_SIZE + 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    fontSize: 17,
    backgroundColor: colors.surface,
    color: colors.text,
    ...shadows.card,
  },
  lookupButton: { paddingHorizontal: spacing.xl },

  altGroup: { gap: spacing.sm },
  altHeading: { ...typography.overline, color: colors.textSubtle, marginBottom: spacing.xxs },
  altButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  altButtonDisabled: { opacity: 0.45 },
  altIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altBody: { flex: 1 },
  altTitle: { ...typography.bodyStrong, color: colors.text },
  altSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
});