import type { AiProvenance, AnalysisSource, Coverage } from '../ai/types';

export type Severity = 'unsafe' | 'caution' | 'safe';

/**
 * Re-exported from the AI layer so the domain types can describe coverage without
 * the rules package depending on the feature, and so there is exactly one
 * definition of each union in the codebase.
 *
 * `src/ai/types.ts` imports nothing, so this introduces no cycle.
 */
export type { Coverage, AnalysisSource, AiProvenance };

export type FlagCategory = 'allergen' | 'additive' | 'substance' | 'label-warning';

export interface Flag {
  id: string;
  severity: Severity;
  label: string;
  reason: string;
  category: FlagCategory;
  crossContamination?: boolean;
  /** Match confidence (0-1). 1.0 = exact match, lower = fuzzy match. */
  confidence?: number;
  /** How the match was made: exact, fuzzy, partial, or none. */
  matchType?: 'exact' | 'fuzzy' | 'partial' | 'none';
  /** The rule term that was matched (for fuzzy matches). */
  matchedTerm?: string;
  /** Where the flag came from: local rule engine or web search. */
  source?: 'local' | 'web';
}

export type Verdict = 'safe' | 'caution' | 'unsafe';

export interface Rule {
  id: string;
  /** Terms that trigger this rule. Matched as whole words against normalized text. */
  match: string[];
  /**
   * Terms that veto this rule. A rule only fires when a `match` term hits AND no
   * `exclude` term hits. Needed because bare ingredient names are ambiguous:
   * "butter" is milk in "butter" but not in "peanut butter", and "lecithin" is soy
   * only when the source is declared.
   */
  exclude?: string[];
  severity: Severity;
  label: string;
  reason: string;
  category: FlagCategory;
}

export interface Ruleset {
  rulesetVersion: string;
  rules: Rule[];
}

export interface ParsedIngredients {
  /** Everything on the label outside an allergen statement, split into items. */
  ingredients: string[];
  /** Items from an explicit declaration, e.g. "Contains: milk, soy". */
  declaredAllergens: string[];
  /** Items from a cross-contamination statement, e.g. "May contain: nuts". */
  mayContain: string[];
}

export interface EngineResult {
  flags: Flag[];
  verdict: Verdict;
  /**
   * True when no ingredients, declaration or trace line could be read at all. The
   * verdict is then meaningless: an unreadable label must never be presented as a
   * clean bill of health.
   */
  insufficientData: boolean;
}

export interface ScanResult {
  source: 'barcode' | 'label' | 'manual';
  barcode?: string;
  productName?: string;
  brands?: string;
  imageUrl?: string;
  rawIngredients: string;
  parsed: ParsedIngredients;
  flags: Flag[];
  verdict: Verdict;
  /** No readable ingredient text was found; the verdict must not be trusted. */
  insufficientData: boolean;
  vegMark: 'veg' | 'non-veg' | 'unknown';
  offAttribution: boolean;
  offUrl?: string;
  createdAt: string;
  rulesetVersion: string;
  /**
   * How much confidence the pipeline has that it actually read the label.
   *
   * 'unverified' is the value that matters: the rule set could not read this
   * label's language, so a clean verdict must not be shown as a bill of health.
   */
  coverage?: Coverage;
  /** OCR confidence score (0-1) from multi-pass OCR. */
  ocrConfidence?: number;
  /** Which tier produced the verdict, for the result screen's disclosure. */
  analysisSource?: AnalysisSource;
  /** Coverage and ruleset version the verdict was recorded under. */
  aiProvenance?: AiProvenance;
}
