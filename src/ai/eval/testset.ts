/**
 * Gold evaluation set for the label-analysis pipeline.
 *
 * The cases are weighted toward the failure this feature exists to remove: a
 * label in a language the bundled ruleset has no terms for, where the engine
 * returns zero matches and the verdict comes back `safe`. Every one of those is
 * a false negative that could put a peanut-allergic user at risk.
 *
 * Translations are deliberately realistic packaging wording rather than literal
 * glosses, because the parser has to cope with the actual section headers and
 * separators a printer uses.
 */

export type EvalCategory =
  | 'non-latin-declared'
  | 'latin-uncovered-language'
  | 'clean-control'
  | 'unreadable'
  | 'ocr-typo';

export interface EvalCase {
  id: string;
  language: string;
  category: EvalCategory;
  /** Raw label text as it would arrive from OCR or a paste. */
  text: string;
  /** Canonical ruleset ids that are genuinely present. */
  expectedAllergens: string[];
  expectedVerdict: 'safe' | 'caution' | 'unsafe';
/**
   * True when this label is expected to be unreadable, so the pipeline must
   * refuse to show a trusted verdict rather than guess. Being allowed to be
   * unresolved is not a pass: abstaining is correct, claiming SAFE is not.
   */
  requiresAbstention: boolean;
  /**
   * Whether an ingredient header was located by `extractIngredientSection`.
   * Omitted for pasted or typed text, where no OCR is involved.
   */
  foundHeader?: boolean;
  note: string;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'hi-declared-wheat-peanut',
    language: 'hi',
    category: 'non-latin-declared',
    // "विवरण" is the header this app's own recognizer already matches, so
    // foundHeader is true and insufficientData is false. Worst case for the
    // existing safety net: readable-looking, unreadable-by-ruleset.
    text: 'विवरण: गेहूँ का आटा, मूंगफली का तेल, चीनी, नमक',
    expectedAllergens: ['allergen:wheat', 'allergen:peanut'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Hindi pack declaring wheat and peanut. Offline ruleset matches nothing.',
    foundHeader: true,
  },
  {
    id: 'hi-milk-powder',
    language: 'hi',
    category: 'non-latin-declared',
text: 'सामग्री: दूध चूर, गुड़, गेहूँ का आटा, नमक',
    expectedAllergens: ['allergen:milk', 'allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Hindi ingredients with an inline wheat term rather than a Contains line.',
  },
  {
    id: 'ta-egg-milk-flour',
    language: 'ta',
    category: 'non-latin-declared',
text: 'மூலவைகள்: மண்டை, மா, சர்க்கரை, கோதுமை மாவு',
    expectedAllergens: ['allergen:egg', 'allergen:milk', 'allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Tamil list: egg, milk, sugar, wheat flour. Names wheat explicitly, because a bare flour word also covers rice and gram flour.',
  },
  {
    id: 'bn-milk-wheat',
    language: 'bn',
    category: 'non-latin-declared',
    text: 'উপাদান: দুধ, চিনি, গমের আটা, লবণ',
    expectedAllergens: ['allergen:milk', 'allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Bengali list: milk, sugar, wheat flour, salt.',
  },
  {
    id: 'ar-peanut-oil',
    language: 'ar',
    category: 'non-latin-declared',
    text: 'المكونات: زيت الفول السوداني، سكّر، ملح',
    expectedAllergens: ['allergen:peanut'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Arabic list with peanut oil.',
  },
  {
    id: 'th-milk-wheat',
    language: 'th',
    category: 'non-latin-declared',
    text: 'ส่วนประกอบ: นมผง น้ำตาล ข้าวสาลี',
    expectedAllergens: ['allergen:milk', 'allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Thai list: milk powder, sugar, wheat.',
  },
  {
    id: 'ja-wheat-flour',
    language: 'ja',
    category: 'non-latin-declared',
    text: '原材料名: 小麦粉、砂糖、食塩',
    expectedAllergens: ['allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Japanese list. Non-Latin script normalises to empty under the engine.',
  },
  {
    id: 'ko-wheat-flour',
    language: 'ko',
    category: 'non-latin-declared',
    text: '재료: 밀가루, 설탕, 소금',
    expectedAllergens: ['allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Korean list containing wheat flour.',
  },
  {
    id: 'ru-wheat-flour',
    language: 'ru',
    category: 'non-latin-declared',
    text: 'Состав: пшеничная мука, сахар, соль',
    expectedAllergens: ['allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Russian is covered by script, including the inflected "пшеничная мука".',
  },
  {
    id: 'vi-soy-oil',
    language: 'vi',
    category: 'non-latin-declared',
    text: 'Thành phần: dầu đậu nành, đường, muối',
    expectedAllergens: ['allergen:soy'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note:
      'Latin script, so only the language test can tell it apart from French. ' +
      'Now covered: "đậu nành" is a curated soy term.',
  },
  {
    id: 'el-wheat-flour',
    language: 'el',
    category: 'non-latin-declared',
    text: 'Συστατικά: αλεύρι σιταριού, ζάχαρη, αλάτι',
    expectedAllergens: ['allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note:
      'Greek is covered by script, but only via the inflected genitive ' +
      '"σιταριού", which is why the ruleset lists it separately from "σιτάρι".',
  },
  {
    id: 'hi-clean-no-allergens',
    language: 'hi',
    category: 'clean-control',
    text: 'सामग्री: चावल का आटा, चीनी, नमक, सूरजमुखी का तेल',
    expectedAllergens: [],
    expectedVerdict: 'safe',
    requiresAbstention: false,
    note:
      'Genuinely allergen-free, but unreadable offline. Must present as unverified ' +
      'rather than trusting a safe verdict the ruleset never earned.',
  },
  {
    id: 'en-clean-control',
    language: 'en',
    category: 'clean-control',
    text: 'INGREDIENTS: Rice flour, Sugar, Vegetable oil, Salt',
    expectedAllergens: [],
    expectedVerdict: 'safe',
    requiresAbstention: false,
    note: 'Control: a clean English label must stay fast, offline and trusted.',
  },
  {
    id: 'en-declared-milk-wheat',
    language: 'en',
    category: 'clean-control',
    text: 'INGREDIENTS: Wheat flour, Sugar, Butter 22%, Milk solids\nCONTAINS: WHEAT, MILK',
    expectedAllergens: ['allergen:wheat', 'allergen:milk'],
    expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note: 'Control: the already-working English path must not regress.',
  },
  {
    id: 'en-unreadable',
    language: 'en',
    category: 'unreadable',
    text: 'Toll free 1800-123-4567\nMRP Rs.45.00',
    expectedAllergens: [],
    expectedVerdict: 'safe',
  requiresAbstention: true,
    foundHeader: false,
    note: 'Control: a photo of a price sticker must read NOT READ, never SAFE.',
  },
  {
    id: 'he-wheat-sugar',
    language: 'he',
    category: 'unreadable',
    text: 'רכיבים: חיטה, סוכר, מלח',
    expectedAllergens: ['allergen:wheat'],
    expectedVerdict: 'unsafe',
    requiresAbstention: true,
    note:
      'Hebrew is the control for over-confident coverage. The ruleset holds one Hebrew ' +
      'term, "גלוטמט", and it belongs to a caution rule, so there is nothing to match an ' +
      'allergen against. Must abstain rather than report a clean bill of health.',
  },
  {
    id: 'id-soy-oil',
    language: 'id',
    category: 'latin-uncovered-language',
    text: 'Bahan: minyak kedelai, gula, garam, air',
    expectedAllergens: ['allergen:soy'],
expectedVerdict: 'unsafe',
    requiresAbstention: false,
    note:
      'The control for script-based reasoning, and it cuts the other way. Indonesian is ' +
      'Roman letters, exactly like French, so no script check can catch it, and the ' +
      'language lexicon does not cover it, so coverage is unverified. The ruleset still ' +
      'holds "kedelai" as a soy term, and the finding must survive the unverified label.',
  },
  {
    id: 'id-clean-control',
    language: 'id',
    category: 'clean-control',
    text: 'Bahan: minyak kelapa, gula, garam, air',
    expectedAllergens: [],
    expectedVerdict: 'safe',
    requiresAbstention: true,
    note:
      'The most dangerous shape of this case: a genuinely allergen-free label in a ' +
      'language the app cannot read. Reporting SAFE here would be a false negative in ' +
      'the one direction that hurts.',
  },
];

export const EVAL_CASES_BY_ID = new Map(EVAL_CASES.map(item => [item.id, item]));
