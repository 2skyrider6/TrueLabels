export type Severity = 'unsafe' | 'caution';

export type FlagCategory = 'allergen' | 'additive' | 'substance' | 'label-warning';

export interface Flag {
  id: string;
  severity: Severity;
  label: string;
  reason: string;
  category: FlagCategory;
  crossContamination?: boolean;
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
}
