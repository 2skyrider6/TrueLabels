import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useResult } from '@/context/ResultContext';
import { parseIngredients } from '@/rules/parser';
import { evaluateEngine, loadRuleset } from '@/rules/engine';
import { Button, Callout } from '@/components/ui';
import { colors, radii, shadows, spacing, typography } from '@/theme/tokens';

const ruleset = loadRuleset();

export default function PasteScreen() {
  const [textInput, setTextInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const navigation = useRouter();
  const { setResult } = useResult();

  const canAnalyze = textInput.trim().length > 0 && !processing;

  const handleAnalyze = useCallback(async () => {
    if (!textInput.trim()) {
      Alert.alert('No Text', 'Please paste ingredient text to analyze.');
      return;
    }

    setProcessing(true);

    try {
      const parsed = parseIngredients(textInput);
      const { flags, verdict, insufficientData } = evaluateEngine(parsed, ruleset);

      setResult({
        source: 'manual',
        rawIngredients: textInput,
        parsed,
        flags,
        verdict,
        insufficientData,
        vegMark: 'unknown',
        offAttribution: false,
        createdAt: new Date().toISOString(),
        rulesetVersion: ruleset.rulesetVersion,
      });
      navigation.replace('/result');
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Error', 'Failed to analyze ingredients. Please try again.');
    } finally {
      setProcessing(false);
    }
  }, [textInput, navigation, setResult]);

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
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Type the ingredients
          </Text>
          <Text style={styles.subtitle}>
            Paste the ingredient list from the pack. It is analysed for allergens and additives
            on this device.
          </Text>
        </View>

        <View style={styles.editor}>
          <TextInput
            style={styles.textInput}
            placeholder="Milk, Sugar, Wheat Flour, Egg, May contain: Nuts, Soy"
            placeholderTextColor={colors.textSubtle}
            value={textInput}
            onChangeText={setTextInput}
            multiline
            editable={!processing}
            textAlignVertical="top"
            accessibilityLabel="Ingredients text"
            accessibilityHint="Paste the ingredient list from the food package"
          />
          {textInput.length > 0 && (
            <View style={styles.editorFooter}>
              <Text style={styles.charCount}>
                {textInput.trim().split(/[,\n]/).filter(s => s.trim()).length} items
              </Text>
              <Text
                style={styles.clearText}
                onPress={() => setTextInput('')}
                accessibilityRole="button"
                accessibilityLabel="Clear ingredients text"
              >
                Clear
              </Text>
            </View>
          )}
        </View>

        <Button
          label="Analyse ingredients"
          icon="search-outline"
          onPress={handleAnalyze}
          disabled={!canAnalyze}
          loading={processing}
        />

        <Callout tone="neutral" icon="lock-closed-outline" title="Private and offline">
          Analysis runs entirely on this device. Barcode lookup needs a network connection, but
          typed and photographed ingredient text does not.
        </Callout>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.xl,
  },

  intro: { gap: spacing.xs },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },

  editor: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  textInput: {
    minHeight: 180,
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
  clearText: { ...typography.captionStrong, color: colors.primary },
});