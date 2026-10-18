/**
 * Multi-pass OCR orchestrator.
 *
 * Runs OCR on multiple variants of the same label image and reconciles the
 * results into a single best-effort text with a confidence score.
 *
 * Pass A: Original image (default settings) - fast path
 * Pass B: Preprocessed (contrast/sharpen/noise) image - for blur/low-res
 * Pass C: Stronger preprocessing for small text - for tiny ingredient text
 *
 * Passes run sequentially with short-circuit: if Pass A produces high-confidence
 * text with an ingredient header, later passes are skipped to stay under the
 * 2-second latency budget.
 */

import { recognizeTextFromUri } from './recognize';
import { preprocessImage, preprocessForSmallText } from './preprocess';

/**
 * Result of a single OCR pass.
 */
export interface OCRPassResult {
  /** Raw OCR text from this pass. */
  text: string;
  /** Estimated confidence in this pass (0-1). */
  confidence: number;
  /** Which pass this was. */
  pass: 'original' | 'enhanced' | 'small-text';
  /** Time spent on this pass in ms. */
  processingTime: number;
  /** URI of the image used (may be preprocessed). */
  imageUri: string;
}

/**
 * Result of the orchestrated OCR run.
 */
export interface OrchestratedOCRResult {
  /** Consensus text from all passes. */
  text: string;
  /** Overall confidence in the OCR result (0-1). */
  confidence: number;
  /** Individual pass results for debugging. */
  passes: OCRPassResult[];
  /** Whether an ingredient header was found in any pass. */
  headerFound: boolean;
  /** Best image URI for downstream use. */
  bestImageUri: string;
}

/** Minimum text length to consider a pass viable. */
const MIN_TEXT_LENGTH = 10;

/** Confidence threshold for short-circuiting (skip later passes). */
const SHORT_CIRCUIT_CONFIDENCE = 0.8;

/** Maximum total processing time in ms before aborting remaining passes. */
const MAX_TOTAL_TIME_MS = 1800;

/**
 * Scores a single OCR pass based on text characteristics.
 *
 * Factors:
 * - Text length (longer = more text was read)
 * - Ingredient header presence (strong signal of a real label)
 * - Ingredient-like keyword density
 */
function scorePass(text: string, hasHeader: boolean): number {
  if (!text || text.trim().length < MIN_TEXT_LENGTH) return 0.1;

  let score = 0.3; // Base score for having some text

  // Length factor: more text = more of the label was read
  const lengthScore = Math.min(text.trim().length / 200, 0.3);
  score += lengthScore;

  // Header presence is the strongest signal
  if (hasHeader) score += 0.3;

  // Ingredient keyword density
  const ingredientKeywords = [
    'ingredients', 'contains', 'allergen', 'wheat', 'milk', 'egg', 'soy',
    'peanut', 'tree nut', 'fish', 'shellfish', 'sesame', 'sulfite',
    'may contain', 'trace', 'flour', 'sugar', 'salt', 'oil',
  ];
  const lowerText = text.toLowerCase();
  const keywordCount = ingredientKeywords.filter(k => lowerText.includes(k)).length;
  score += Math.min(keywordCount * 0.03, 0.15);

  return Math.min(score, 0.95);
}

/**
 * Checks if text contains an ingredient header signal.
 */
function hasIngredientHeader(text: string): boolean {
  const headerPatterns = [
    /ingredients?\s*[:–—]?/i,
    /composition\s*[:–—]?/i,
    /विवरण\s*[:–—]?/i,
    /المكونات\s*[:–—]?/i,
    /原材料名\s*[:–—]?/i,
    /재료\s*[:–—]?/i,
    /Состав\s*[:–—]?/i,
    /Thành phần\s*[:–—]?/i,
    /Συστατικά\s*[:–—]?/i,
    /Bahan\s*[:–—]?/i,
    /contains?\s*[:–—]?/i,
  ];
  return headerPatterns.some(p => p.test(text));
}

/**
 * Computes consensus text from multiple OCR passes.
 *
 * Strategy:
 * 1. Start with the highest-confidence pass text as the base
 * 2. For each other pass, add any unique ingredient-like lines not already present
 * 3. Deduplicate overlapping lines
 */
function computeConsensus(passes: OCRPassResult[]): { text: string; confidence: number } {
  if (passes.length === 0) return { text: '', confidence: 0 };
  if (passes.length === 1) {
    return { text: passes[0].text, confidence: passes[0].confidence };
  }

  // Sort by confidence descending
  const sorted = [...passes].sort((a, b) => b.confidence - a.confidence);
  const base = sorted[0];
  const others = sorted.slice(1);

  const baseLines = base.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const baseSet = new Set(baseLines.map(l => l.toLowerCase()));

  // Add unique lines from other passes
    const additionalLines: string[] = [];
  for (const pass of others) {
    const lines = pass.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      const key = line.toLowerCase();
      if (!baseSet.has(key) && line.length > 2) {
        additionalLines.push(line);
        baseSet.add(key);
      }
    }
  }

  // Combine: base lines first, then additional unique lines
  const allLines = [...baseLines, ...additionalLines];
  const consensusText = allLines.join('\n');

  // Consensus confidence: base confidence + bonus for cross-pass agreement
  const agreementBonus = Math.min((passes.length - 1) * 0.05, 0.15);
  const consensusConfidence = Math.min(base.confidence + agreementBonus, 0.95);

  return { text: consensusText, confidence: consensusConfidence };
}

/**
 * Runs multi-pass OCR on a label image.
 *
 * Strategy:
 * 1. Pass A: OCR on the original image
 * 2. If confidence < threshold or no header, preprocess and run Pass B
 * 3. If still low confidence, try small-text preprocessing (Pass C)
 * 4. Reconcile all passes into a consensus result
 *
 * Short-circuits if Pass A achieves high confidence with a header found.
 */
export async function recognizeOrchestrated(uri: string): Promise<OrchestratedOCRResult> {
  const startTime = Date.now();
  const passes: OCRPassResult[] = [];

  // ---------- Pass A: Original image ----------
  const passAStart = Date.now();
  let resultA;
  try {
    resultA = await recognizeTextFromUri(uri);
  } catch (error) {
    // Re-throw errors so the UI can show appropriate alerts
    // (e.g., "development build required" for missing native module).
    throw error;
  }
  const passA: OCRPassResult = {
    text: resultA.text ?? '',
    confidence: scorePass(resultA.text ?? '', hasIngredientHeader(resultA.text ?? '')),
    pass: 'original',
    processingTime: Date.now() - passAStart,
    imageUri: uri,
  };
  passes.push(passA);

  // Short-circuit: high confidence with header found
  if (
    passA.confidence >= SHORT_CIRCUIT_CONFIDENCE &&
    hasIngredientHeader(passA.text)
  ) {
    const consensus = computeConsensus(passes);
    return {
      text: consensus.text,
      confidence: consensus.confidence,
      passes,
      headerFound: hasIngredientHeader(passA.text),
      bestImageUri: uri,
    };
  }

  // Check elapsed time
  if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
    const consensus = computeConsensus(passes);
    return {
      text: consensus.text,
      confidence: consensus.confidence,
      passes,
      headerFound: hasIngredientHeader(passA.text),
      bestImageUri: uri,
    };
  }

  // ---------- Pass B: Preprocessed image ----------
  const preprocessed = await preprocessImage(uri);
  const passBStart = Date.now();
  let resultB;
  try {
    resultB = await recognizeTextFromUri(preprocessed.uri);
  } catch {
    resultB = { text: '' };
  }
  const passB: OCRPassResult = {
    text: resultB.text ?? '',
    confidence: scorePass(resultB.text ?? '', hasIngredientHeader(resultB.text ?? '')),
    pass: 'enhanced',
    processingTime: Date.now() - passBStart,
    imageUri: preprocessed.uri,
  };
  passes.push(passB);

  // Short-circuit after Pass B
  if (
    passB.confidence >= SHORT_CIRCUIT_CONFIDENCE &&
    hasIngredientHeader(passB.text)
  ) {
    const consensus = computeConsensus(passes);
    return {
      text: consensus.text,
      confidence: consensus.confidence,
      passes,
      headerFound: hasIngredientHeader(passB.text),
      bestImageUri: preprocessed.uri,
    };
  }

  if (Date.now() - startTime > MAX_TOTAL_TIME_MS) {
    const consensus = computeConsensus(passes);
    return {
      text: consensus.text,
      confidence: consensus.confidence,
      passes,
      headerFound: passes.some(p => hasIngredientHeader(p.text)),
      bestImageUri: passB.confidence > passA.confidence ? preprocessed.uri : uri,
    };
  }

  // ---------- Pass C: Small-text preprocessing ----------
  const smallText = await preprocessForSmallText(uri);
  const passCStart = Date.now();
  let resultC;
  try {
    resultC = await recognizeTextFromUri(smallText.uri);
  } catch {
    resultC = { text: '' };
  }
  const passC: OCRPassResult = {
    text: resultC.text ?? '',
    confidence: scorePass(resultC.text ?? '', hasIngredientHeader(resultC.text ?? '')),
    pass: 'small-text',
    processingTime: Date.now() - passCStart,
    imageUri: smallText.uri,
  };
  passes.push(passC);

  const consensus = computeConsensus(passes);
  const headerFound = passes.some(p => hasIngredientHeader(p.text));

  // Determine best image URI (highest confidence pass)
  const bestPass = passes.reduce((best, p) => (p.confidence > best.confidence ? p : best), passes[0]);

  return {
    text: consensus.text,
    confidence: consensus.confidence,
    passes,
    headerFound,
    bestImageUri: bestPass.imageUri,
  };
}

/**
 * Quick confidence check without full orchestration.
 * Used by the UI to decide whether to show an "enhance" prompt.
 */
export async function quickConfidenceCheck(uri: string): Promise<{ confidence: number; headerFound: boolean }> {
  const result = await recognizeTextFromUri(uri).catch(() => ({ text: '' }));
  const text = result.text ?? '';
  return {
    confidence: scorePass(text, hasIngredientHeader(text)),
    headerFound: hasIngredientHeader(text),
  };
}