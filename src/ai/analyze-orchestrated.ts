/**
 * Orchestrated analysis pipeline.
 *
 * Combines multi-pass OCR, fuzzy rule matching, and confidence-weighted
 * verdicts into a single analysis flow. This augments (not replaces) the
 * existing single-pass `analyze()` in `src/ai/analyze.ts`.
 *
 * The pipeline:
 * 1. Multi-pass OCR on the label image (original + preprocessed variants)
 * 2. Ingredient parsing from OCR text
 * 3. Exact rule matching via the existing engine
 * 4. Fuzzy matching for OCR typos on unmatched ingredients
 * 5. Confidence-weighted verdict assembly
 * 6. Safety gate (presentVerdict) — unchanged, still the final authority
 *
 * The safety-critical properties are preserved:
 * - An unverified/unreadable label never presents as trusted SAFE
 * - Exclude vetoes always override matches (zero false positives from vetoed terms)
 * - Low-confidence fuzzy matches don't upgrade verdicts to UNSAFE
 */

import { presentVerdict } from './merge';
import { evaluateEngine, loadRuleset } from '../rules/engine';
import { parseIngredients } from '../rules/parser';
import { ParsedIngredients, Flag, Ruleset, Coverage, Verdict } from '../rules/types';
import { recognizeOrchestrated, OrchestratedOCRResult } from '../ocr/orchestrator';
import {
  CONFIDENCE_THRESHOLDS,
  confidenceTriggersVerdict,
  matchTerm,
} from '../rules/fuzzy';

/**
 * Output of the orchestrated analysis pipeline.
 */
export interface OrchestratedAnalysisResult {
  /** Parsed ingredient data from OCR text */
  parsed: ParsedIngredients;
  /** Engine result with combined exact + fuzzy flags */
  result: {
    flags: FlagWithConfidence[];
    verdict: Verdict;
    insufficientData: boolean;
  };
  /** Coverage assessment */
  coverage: Coverage;
  /** Analysis source */
  source: 'rules';
  /** Provenance metadata */
  provenance: {
    coverage: Coverage;
    source: 'rules';
    rulesetVersion: string;
  };
  /** Dominant script of the text */
  language: string;
  /** Human-readable explanation */
  escalation: string;
  /** OCR confidence score (0-1) */
  ocrConfidence: number;
  /** Flags with per-flag confidence scores */
  flagsWithConfidence: FlagWithConfidence[];
  /** Overall confidence in the analysis (0-1) */
  overallConfidence: number;
}

/**
 * A flag with per-match confidence scoring.
 */
export interface FlagWithConfidence {
  id: string;
  severity: 'unsafe' | 'caution';
  label: string;
  reason: string;
  category: 'allergen' | 'additive' | 'substance' | 'label-warning';
  crossContamination: boolean;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  matchedTerm?: string;
}

/**
 * Run the orchestrated analysis pipeline on a label image.
 *
 * Steps:
 * 1. Multi-pass OCR on the image (or reuse a provided OCR result)
 * 2. Parse ingredients from OCR text
 * 3. Exact rule matching via existing engine
 * 4. Fuzzy matching for OCR typos on unmatched ingredients
 * 5. Combine flags with confidence scores
 * 6. Apply safety gate (presentVerdict)
 * 7. Calculate confidence-weighted safety score
 *
 * @param imageUri - File URI of the label image
 * @param options - Optional overrides (ruleset, foundHeader, pre-computed OCR result)
 * @returns Orchestrated analysis result
 */
export async function analyzeOrchestrated(
  imageUri: string,
  options: {
    ruleset?: any;
    foundHeader?: boolean;
    /** Pre-computed OCR result to skip re-running OCR */
    ocrResult?: OrchestratedOCRResult;
  } = {}
): Promise<OrchestratedAnalysisResult> {
  const ruleset = options.ruleset ?? loadRuleset();

  // Step 1: Multi-pass OCR (or reuse provided result)
  const ocrResult = options.ocrResult ?? (await recognizeOrchestrated(imageUri));

  // Step 2: Parse ingredients from OCR text
  const parsed = parseIngredients(ocrResult.text);

  // Step 3: Exact rule matching via existing engine
  const exactResult = evaluateEngine(parsed, ruleset);

  // Step 4: Fuzzy matching for ingredients not already matched exactly
  const existingFlagIds = new Set(exactResult.flags.map(f => f.id));
  const fuzzyFlags = matchIngredientsWithFuzzy(parsed, ruleset, existingFlagIds);

  // Step 5: Combine exact and fuzzy flags
  const allFlags = combineFlagsWithConfidence(exactResult.flags, fuzzyFlags);

  // Step 6: Determine verdict
  // Exact verdict is the base; fuzzy unsafe matches can upgrade
  let verdict: Verdict = exactResult.verdict;
  if (exactResult.verdict === 'safe' || exactResult.verdict === 'caution') {
    const hasUnsafeFuzzy = fuzzyFlags.some(
      f => f.severity === 'unsafe' && confidenceTriggersVerdict(f.confidence, 'unsafe')
    );
    if (hasUnsafeFuzzy) {
      verdict = 'unsafe';
    } else if (
      exactResult.verdict === 'safe' &&
      fuzzyFlags.some(f => f.severity === 'caution' && confidenceTriggersVerdict(f.confidence, 'caution'))
    ) {
      verdict = 'caution';
    }
  }

  // Step 7: Apply safety gate (presentVerdict is the single authority)
  const insufficientData =
    exactResult.insufficientData || parsed.ingredients.length === 0;
  const coverage = ocrResult.headerFound ? 'verified' : 'unverified';

  const presentation = presentVerdict(verdict, coverage, insufficientData);

  return {
    parsed,
    result: {
      flags: allFlags,
      verdict,
      insufficientData,
    },
    coverage,
    source: 'rules',
    provenance: {
      coverage,
      source: 'rules',
      rulesetVersion: ruleset.rulesetVersion,
    },
    language: '',
    escalation: presentation.caveat ?? 'Checked against the bundled allergen ruleset, on this device.',
    ocrConfidence: ocrResult.confidence,
    flagsWithConfidence: allFlags,
    overallConfidence: Math.min(ocrResult.confidence, 0.95),
  };
}

/**
 * Run fuzzy matching on ingredients that weren't already matched exactly.
 * Skips ingredients that already produced a flag with the same rule ID.
 */
function matchIngredientsWithFuzzy(
  parsed: ParsedIngredients,
  ruleset: Ruleset,
  existingFlagIds: Set<string>
): {
  id: string;
  severity: 'unsafe' | 'caution';
  label: string;
  reason: string;
  category: 'allergen' | 'additive' | 'substance' | 'label-warning';
  crossContamination: boolean;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  matchedTerm: string;
}[] {
  // Collect all ingredient texts with their source
  const allIngredients: {
    text: string;
    source: 'ingredient' | 'declared' | 'trace';
  }[] = [
    ...parsed.ingredients.map(i => ({ text: i, source: 'ingredient' as const })),
    ...parsed.declaredAllergens.map(i => ({ text: i, source: 'declared' as const })),
    ...parsed.mayContain.map(i => ({ text: i, source: 'trace' as const })),
  ];

  const fuzzyFlags: {
    id: string;
    severity: 'unsafe' | 'caution';
    label: string;
    reason: string;
    category: 'allergen' | 'additive' | 'substance' | 'label-warning';
    crossContamination: boolean;
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
    matchedTerm: string;
  }[] = [];

  for (const item of allIngredients) {
    const normalizedItem = item.text.toLowerCase().trim();
    if (!normalizedItem) continue;

    // Try fuzzy match against each rule
    for (const rule of ruleset.rules) {
      // Skip if already flagged by exact matching
      if (existingFlagIds.has(rule.id)) continue;

      // Check exclude vetoes
      if (
        rule.exclude &&
        rule.exclude.some(term => normalizedItem.includes(term.toLowerCase()))
      ) {
        continue;
      }

      // Try fuzzy match against each match term
      for (const term of rule.match) {
        const matchResult = matchTerm(normalizedItem, term.toLowerCase());
        if (
          matchResult.matched &&
          matchResult.confidence >= CONFIDENCE_THRESHOLDS.MIN_MATCH
        ) {
          fuzzyFlags.push({
            id: rule.id,
            severity: rule.severity,
            label:
              matchResult.matchType === 'fuzzy' ||
              matchResult.matchType === 'partial'
                ? `Possible ${rule.label}`
                : rule.label,
            reason: rule.reason,
            category: rule.category,
            crossContamination: item.source === 'trace',
            confidence: matchResult.confidence,
            matchType: matchResult.matchType,
            matchedTerm: matchResult.matchedTerm,
          });
          break; // One match per rule per ingredient
        }
      }
    }
  }

  return fuzzyFlags;
}

/**
 * Combine exact-match flags and fuzzy-match flags, deduplicating by rule ID.
 * Exact-match flags get confidence 1.0; fuzzy flags keep their scored confidence.
 */
function combineFlagsWithConfidence(
  exactFlags: Flag[],
  fuzzyFlags: FlagWithConfidence[]
): FlagWithConfidence[] {
  const seen = new Set<string>();
  const combined: FlagWithConfidence[] = [];

  for (const f of exactFlags) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      combined.push({
        ...f,
        confidence: 1.0,
        matchType: 'exact',
        crossContamination: f.crossContamination ?? false,
      });
    }
  }

  for (const f of fuzzyFlags) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      combined.push(f);
    }
  }

  return combined;
}