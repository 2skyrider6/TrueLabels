/**
 * Unicode script detection for label text.
 *
 * This exists to answer one question before any model is called: can the
 * deterministic ruleset read this text at all?
 *
 * The shipped `ruleset.json` contains only Latin-script match terms, and
 * `normalize()` in `src/rules/parser.ts` reduces every term to `[a-z0-9]`. A
 * rule term in any other script normalises to the empty string and can never
 * match, so coverage of a non-Latin label is structurally zero rather than
 * merely incomplete. Detecting the script is what lets the app stop presenting
 * those labels as SAFE.
 */

export type Script =
  | 'latin'
  | 'cyrillic'
  | 'greek'
  | 'arabic'
  | 'hebrew'
  | 'devanagari'
  | 'bengali'
  | 'gurmukhi'
  | 'gujarati'
  | 'tamil'
  | 'telugu'
  | 'kannada'
  | 'malayalam'
  | 'sinhala'
  | 'thai'
  | 'lao'
  | 'tibetan'
  | 'myanmar'
  | 'khmer'
  | 'han'
  | 'hiragana'
  | 'katakana'
  | 'hangul'
  | 'unknown';

/** Ordered longest-risk-first: the first matching block wins the codepoint. */
const SCRIPT_RANGES: readonly (readonly [Script, number, number])[] = [
  ['hiragana', 0x3040, 0x309f],
  ['katakana', 0x30a0, 0x30ff],
  ['han', 0x4e00, 0x9fff],
  ['han', 0x3400, 0x4dbf],
  ['hangul', 0xac00, 0xd7af],
  ['hangul', 0x1100, 0x11ff],
  ['cyrillic', 0x0400, 0x04ff],
  ['greek', 0x0370, 0x03ff],
  ['arabic', 0x0600, 0x06ff],
  ['arabic', 0x0750, 0x077f],
  ['hebrew', 0x0590, 0x05ff],
  ['devanagari', 0x0900, 0x097f],
  ['bengali', 0x0980, 0x09ff],
  ['gurmukhi', 0x0a00, 0x0a7f],
  ['gujarati', 0x0a80, 0x0aff],
  ['tamil', 0x0b80, 0x0bff],
  ['telugu', 0x0c00, 0x0c7f],
  ['kannada', 0x0c80, 0x0cff],
  ['malayalam', 0x0d00, 0x0d7f],
  ['sinhala', 0x0d80, 0x0dff],
  ['thai', 0x0e00, 0x0e7f],
  ['lao', 0x0e80, 0x0eff],
  ['tibetan', 0x0f00, 0x0fff],
  ['myanmar', 0x1000, 0x109f],
  ['khmer', 0x1780, 0x17ff],
  ['latin', 0x0041, 0x007a],
  ['latin', 0x00c0, 0x024f],
  ['latin', 0x1e00, 0x1eff],
];

/** Punctuation, digits and separators that appear in every script. */
const SCRIPT_AGNOSTIC = /^[\s\d\p{P}\p{S}\p{C}·•‰°+\-–—_/\\()[\]{}<>'"^*#&@~`|.,:;!?'"”‘…%]+$/u;

function scriptOf(char: string): Script {
  const code = char.codePointAt(0);
  if (code === undefined) return 'unknown';
  if (SCRIPT_AGNOSTIC.test(char)) return 'unknown';
  for (const [script, start, end] of SCRIPT_RANGES) {
    if (code >= start && code <= end) return script;
  }
  return 'unknown';
}

/**
 * Scripts whose allergen terms the bundled ruleset can match.
 *
 * Derived from `ruleset.json` by counting allergen terms per script, not written
 * by hand. This set previously said `latin` alone, which was true when the
 * ruleset held only English terms; left as it was, the app would have abstained
 * on every label it had since learned to read, which defeats the feature.
 *
 * Hebrew is deliberately absent: `גלוטמט` (gluten) is its only term and belongs
 * to a caution rule, so there is nothing to match an allergen against. A Hebrew
 * label must still be refused rather than guessed at.
 */
export const RULESET_COVERED_SCRIPTS: ReadonlySet<Script> = new Set<Script>([
  'arabic',
  'bengali',
  'cyrillic',
  'devanagari',
  'greek',
  'gujarati',
  'gurmukhi',
  'han',
  'hangul',
  'hiragana',
  'kannada',
  'katakana',
  'latin',
  'malayalam',
  'tamil',
  'telugu',
  'thai',
]);

/**
 * The Latin-script languages the ruleset was actually curated for.
 *
 * Latin is the one script that needs a separate decision, because it is written
 * by languages the ruleset does not cover. "Bột mì" and "bột đậu tương" are
 * Latin script and indistinguishable from French or Dutch by script alone, so
 * coverage is decided on language using function words and ingredient headwords,
 * the most frequent and most language-distinctive tokens in a short text.
 */
export const RULESET_COVERED_LANGUAGES = [
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'vi',
] as const;

/**
 * Signal words per covered language: function words plus the ingredient nouns
 * that dominate a real label.
 *
 * Function words alone are not enough. An ingredient list is mostly nouns, so
 * "Ingrédients: farine de blé, sucre, lait, sel" contains exactly one function
 * word in seven tokens and falls below any sane function-word threshold. Ingredient
 * headwords are both frequent and language-distinctive, which makes them the
 * stronger signal for this domain.
 *
 * Terms may be written with their accents; `lexicon` folds them the same way the
 * ingredient words are folded, so both sides meet in one normalised form.
 */
const COVERED_LEXICON: Record<string, ReadonlySet<string>> = {
  en: lexicon(['the', 'and', 'of', 'with', 'from', 'may', 'contains', 'made', 'includes', 'not',
    'flour', 'sugar', 'salt', 'water', 'oil', 'milk', 'starch', 'syrup', 'extract', 'powder',
    'vinegar', 'yeast', 'spice', 'rice', 'wheat', 'soy', 'egg', 'butter', 'cream', 'juice',
    'honey', 'cocoa', 'malt', 'gum', 'sauce', 'seed', 'juice', 'puree', 'concentrate']),
  fr: lexicon(['le', 'la', 'les', 'et', 'de', 'des', 'du', 'peut', 'contient', 'ingredients', 'traces',
    'farine', 'sucre', 'sel', 'eau', 'huile', 'lait', 'amidon', 'sirop', 'extrait', 'poudre',
    'vinaigre', 'levure', 'epice', 'riz', 'ble', 'soja', 'oeuf', 'beurre', 'creme', 'jus',
    'miel', 'cacao', 'malt', 'gomme', 'sauce', 'puree', 'concentre']),
  de: lexicon(['und', 'der', 'die', 'das', 'mit', 'aus', 'enthalt', 'kann', 'zutaten', 'spuren',
    'mehl', 'zucker', 'salz', 'wasser', 'ol', 'milch', 'starke', 'sirup', 'extrakt', 'pulver',
    'essig', 'hefe', 'gewurz', 'reis', 'weizen', 'soja', 'ei', 'butter', 'sahne', 'saft',
    'honig', 'kakao', 'malz', 'gummi', 'sauce', 'puree']),
  es: lexicon(['el', 'la', 'los', 'las', 'y', 'de', 'del', 'puede', 'contiene', 'ingredientes', 'trazas',
    'harina', 'azucar', 'sal', 'agua', 'aceite', 'leche', 'almidon', 'jarabe', 'extracto', 'polvo',
    'vinagre', 'levadura', 'especia', 'arroz', 'trigo', 'soja', 'huevo', 'mantequilla', 'crema',
    'jugo', 'miel', 'cacao', 'malta', 'goma', 'salsa', 'pure']),
  it: lexicon(['il', 'la', 'di', 'e', 'con', 'puo', 'contiene', 'ingredienti', 'tracce',
    'farina', 'zucchero', 'sale', 'acqua', 'olio', 'latte', 'amido', 'sciroppo', 'estratto', 'polvere',
    'aceto', 'lievito', 'spezia', 'riso', 'grano', 'soia', 'uovo', 'burro', 'panna', 'succo',
    'miele', 'cacao', 'malto', 'gomma', 'salsa', 'purea']),
  pt: lexicon(['o', 'a', 'os', 'as', 'e', 'de', 'do', 'pode', 'contem', 'ingredientes', 'rastros',
    'farinha', 'acucar', 'sal', 'agua', 'oleo', 'leite', 'amido', 'xarope', 'extrato', 'po',
    'vinagre', 'fermento', 'especiaria', 'arroz', 'trigo', 'soja', 'ovo', 'manteiga', 'creme',
    'suco', 'mel', 'cacau', 'malte', 'goma', 'molho', 'pure']),
  nl: lexicon(['de', 'het', 'en', 'van', 'met', 'kan', 'bevat', 'ingredienten', 'sporen',
    'meel', 'suiker', 'zout', 'water', 'olie', 'melk', 'zetmeel', 'siroop', 'extract', 'poeder',
    'azijn', 'gist', 'specerij', 'rijst', 'tarwe', 'soja', 'ei', 'boter', 'room', 'sap',
    'honing', 'cacao', 'mout', 'gom', 'saus', 'puree']),
  vi: lexicon(['và', 'của', 'các', 'có', 'chứa', 'thành', 'phần', 'nguyên', 'liệu', 'dầu',
    'nước', 'đường', 'muối', 'bột', 'sữa', 'trứng', 'lúa', 'mì', 'đậu', 'nành', 'phộng',
    'tôm', 'cá', 'mè', 'rau', 'mật', 'ong', 'tương', 'kem', 'sốt', 'gạch', 'bánh', 'nhấm']),
};

/**
 * Builds a folded lookup set.
 *
 * Terms are folded on the way in, so they can be written naturally accented here
 * and still match the folded ingredient words. Vietnamese needs this: its
 * orthography is diacritic-based, so `má` and `ma` are different words written
 * the same way once diacritics are dropped, and folding both sides is what makes
 * one lookup set serve every spelling.
 */
function lexicon(terms: string[]): ReadonlySet<string> {
  return new Set(terms.map(foldForMatch));
}

/**
 * Minimum signal-word hit rate for a Latin-script label to count as readable.
 *
 * Low on purpose. A bilingual pack may be mostly ingredient names with a thin
 * English header, and a label written in English with one foreign ingredient
 * still needs to be readable. The goal is to catch "this is a different
 * language", not to certify one, and the AI escalation handles borderline cases
 * anyway.
 */
const MIN_SIGNAL_RATIO = 0.15;

/**
 * Below this word count the signal is too noisy to judge, so the text is assumed
 * readable rather than escalated on a guess.
 */
const MIN_WORDS_FOR_JUDGEMENT = 6;

export interface LanguageCoverage {
  /** Signal-word hit rate against the covered languages. */
  ratio: number;
  words: number;
  /** Languages whose signal words appear, best first. */
  candidates: string[];
  /** True when the text is too short to judge, or looks covered. */
  covered: boolean;
}

/** Signal-word hit rate against the curated languages. */
export function latinLanguageCoverage(text: string): LanguageCoverage {
  const words = (text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [])
    .map(word => foldForMatch(word))
    .filter(word => word.length > 1);

  if (words.length < MIN_WORDS_FOR_JUDGEMENT) {
    return { ratio: 1, words: words.length, candidates: [], covered: true };
  }

  const scores = new Map<string, number>();
  for (const word of words) {
    for (const [language, set] of Object.entries(COVERED_LEXICON)) {
      if (set.has(word)) scores.set(language, (scores.get(language) ?? 0) + 1);
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const hits = ranked.length > 0 ? ranked[0][1] : 0;
  const ratio = hits / words.length;

  return {
    ratio,
    words: words.length,
    candidates: ranked.map(([language]) => language),
    covered: ratio >= MIN_SIGNAL_RATIO,
  };
}

/** Folds diacritics and separators the same way the rules parser does. */
function foldForMatch(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export interface ScriptProfile {
  /** Script -> share of "meaningful" characters. Sums to <= 1. */
  shares: Partial<Record<Script, number>>;
  /** The script with the largest share, or 'unknown' for pure punctuation. */
  dominant: Script;
  /**
   * Share of characters the ruleset cannot read. This is the number that drives
   * escalation: a label with any substantial non-Latin text is unreadable by the
   * deterministic path.
   */
  uncoveredRatio: number;
  /** Distinct non-Latin scripts seen, used to detect mixed-language labels. */
  nonLatinScripts: Script[];
}

/**
 * Proportions each script contributes to `text`.
 *
 * Combining marks and joining marks are counted with their base script instead
 * of being dropped, otherwise Devanagari and Arabic labels would read as mostly
 * "unknown" rather than as one coherent script.
 */
export function profileScripts(text: string): ScriptProfile {
  if (!text) {
    return { shares: {}, dominant: 'unknown', uncoveredRatio: 0, nonLatinScripts: [] };
  }

  // Combining marks attach to the preceding base letter, so they inherit it.
  const counts: Partial<Record<Script, number>> = Object.create(null);
  let total = 0;
  let lastBase: Script = 'unknown';

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isMark =
      (code >= 0x0300 && code <= 0x036f) ||
      (code >= 0x0900 && code <= 0x0903) ||
      (code >= 0x093a && code <= 0x094f) ||
      (code >= 0x200c && code <= 0x200d);

    if (isMark && lastBase !== 'unknown') {
      counts[lastBase] = (counts[lastBase] ?? 0) + 1;
      total += 1;
      continue;
    }

    const script = scriptOf(char);
    if (script !== 'unknown') lastBase = script;
    if (script === 'unknown') continue;
    counts[script] = (counts[script] ?? 0) + 1;
    total += 1;
  }

  const shares: Partial<Record<Script, number>> = Object.create(null);
  for (const [script, count] of Object.entries(counts)) {
    shares[script as Script] = count / total;
  }

  let dominant: Script = 'unknown';
  let best = 0;
  for (const [script, share] of Object.entries(shares)) {
    if (share > best) {
      best = share;
      dominant = script as Script;
    }
  }

  const nonLatinScripts = (Object.keys(shares) as Script[]).filter(
    s => s !== 'latin' && !RULESET_COVERED_SCRIPTS.has(s)
  );

  const uncoveredRatio = nonLatinScripts.reduce(
    (sum, script) => sum + (shares[script] ?? 0),
    0
  );

  return { shares, dominant, uncoveredRatio, nonLatinScripts };
}

const MIN_READABLE_RATIO = 0.85;

/**
 * True when the ruleset can read this text on its own.
 *
 * Two independent checks, because either one alone leaves a hole:
 *
 * 1. Script. Any script with no allergen terms in the ruleset reduces to nothing
 *    a rule can match, so Hebrew text — one caution term, zero allergen terms —
 *    is refused rather than guessed at. Text that is mostly such a script fails
 *    even when a few Latin words appear, because a bilingual pack still buries
 *    the allergens in the part that cannot be read.
 * 2. Language. Latin is the shared script of languages the ruleset covers only in
 *    part, so Latin-dominant text additionally has to look like one of the
 *    curated languages. Without this a Dutch or Indonesian label would read as
 *    covered purely for being written in Roman letters.
 */
export function isRulesetReadable(text: string): boolean {
  const profile = profileScripts(text);
  if (profile.dominant === 'unknown') return false;
  if (profile.uncoveredRatio >= 1 - MIN_READABLE_RATIO) return false;

  if (profile.dominant === 'latin') {
    return latinLanguageCoverage(text).covered;
  }

  return true;
}
