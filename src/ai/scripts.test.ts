import { profileScripts, isRulesetReadable, latinLanguageCoverage, RULESET_COVERED_SCRIPTS } from './scripts';
import { loadRuleset } from '../rules/engine';

/**
 * Coverage detection decides whether the app is allowed to show a verdict at all.
 *
 * These tests exist because the check moved twice and each move had to be
 * verified in the direction that fails safe. When the ruleset held only English
 * terms, every non-Latin label was refused. When it grew to cover seventeen
 * scripts, that refusal became wrong — and a wrong refusal on a Hindi label is
 * still a wrong answer, just an over-cautious one, so it needed the same
 * evidence rather than a relaxed threshold.
 */

/**
 * Which scripts the ruleset can read, derived from the ruleset itself.
 *
 * Counts allergen terms only. `גלוטמט` (gluten) is the single Hebrew term present
 * and it belongs to a caution rule, so counting every term would mark Hebrew as
 * covered and let an allergen-bearing Hebrew label through as SAFE.
 */
function scriptsWithAllergenTerms(): Set<string> {
  const ranges: readonly (readonly [string, number, number])[] = [
    ['hiragana', 0x3040, 0x309f], ['katakana', 0x30a0, 0x30ff],
    ['han', 0x4e00, 0x9fff], ['han', 0x3400, 0x4dbf],
    ['hangul', 0xac00, 0xd7af], ['hangul', 0x1100, 0x11ff],
    ['cyrillic', 0x0400, 0x04ff], ['greek', 0x0370, 0x03ff],
    ['arabic', 0x0600, 0x06ff], ['arabic', 0x0750, 0x077f],
    ['hebrew', 0x0590, 0x05ff], ['devanagari', 0x0900, 0x097f],
    ['bengali', 0x0980, 0x09ff], ['gurmukhi', 0x0a00, 0x0a7f],
    ['gujarati', 0x0a80, 0x0aff], ['tamil', 0x0b80, 0x0bff],
    ['telugu', 0x0c00, 0x0c7f], ['kannada', 0x0c80, 0x0cff],
    ['malayalam', 0x0d00, 0x0d7f], ['sinhala', 0x0d80, 0x0dff],
    ['thai', 0x0e00, 0x0e7f], ['lao', 0x0e80, 0x0eff],
    ['tibetan', 0x0f00, 0x0fff], ['myanmar', 0x1000, 0x109f],
    ['khmer', 0x1780, 0x17ff],
    ['latin', 0x0041, 0x007a], ['latin', 0x00c0, 0x024f], ['latin', 0x1e00, 0x1eff],
  ];
  const ignorable = /^[\s\d\p{P}\p{S}\p{C}]+$/u;

  const scriptOf = (term: string): string | null => {
    for (const char of term.trim()) {
      if (ignorable.test(char)) continue;
      const code = char.codePointAt(0) as number;
      for (const [script, start, end] of ranges) {
        if (code >= start && code <= end) return script;
      }
    }
    return null;
  };

  const found = new Set<string>();
  for (const rule of loadRuleset().rules) {
    if (!rule.id.startsWith('allergen:')) continue;
    for (const term of [...rule.match, ...(rule.exclude ?? [])]) {
      const script = scriptOf(term);
      if (script) found.add(script);
    }
  }
  return found;
}

describe('ruleset coverage matches the ruleset data', () => {
  it('agrees exactly with the scripts that carry allergen terms', () => {
    // The failure this catches is quiet and dangerous in one direction: a script
    // added to the ruleset without updating the constant would be refused, and a
    // script listed in the constant without the terms to back it would be trusted
    // on nothing. `npm run rules:coverage` prints the same derivation.
    expect([...RULESET_COVERED_SCRIPTS].sort()).toEqual([...scriptsWithAllergenTerms()].sort());
  });

  it('does not claim Hebrew, which has a caution term but no allergen terms', () => {
    expect(RULESET_COVERED_SCRIPTS.has('hebrew')).toBe(false);
  });
});

describe('script and language coverage detection', () => {
  it.each([
    ['Hindi', 'विवरण: गेहूँ का आटा, मूंगफली का तेल, चीनी'],
    ['Tamil', 'மூலவைகள்: மண்டை, மா, சர்க்கரை'],
    ['Bengali', 'উপাদান: দুধ, চিনি, গমের আটা, লবণ'],
    ['Arabic', 'المكونات: زيت الفول السوداني، سكّر'],
    ['Thai', 'ส่วนประกอบ: นมผง น้ำตาล'],
    ['Japanese', '原材料名: 小麦粉、砂糖、食塩'],
    ['Korean', '재료: 밀가루, 설탕'],
    ['Russian', 'Состав: пшеничная мука, сахар'],
    ['Greek', 'Συστατικά: αλεύρι σιταριού, ζάχαρη'],
    ['Chinese', '配料: 小麦粉、白砂糖、食盐'],
  ])('reads a %s label the ruleset now covers', (_label, text) => {
    const profile = profileScripts(text);

    // The text really is non-Latin for most of these, which is what used to make
    // it unreadable.
    expect(profile.dominant).not.toBe('latin');
    expect(profile.uncoveredRatio).toBeLessThan(0.15);
    expect(isRulesetReadable(text)).toBe(true);
  });

  it.each([
    ['Hebrew', 'רכיבים: חיטה, סוכר, מלח'],
    ['Sinhala', 'අංග: පබු, සීනි, තණ'],
    ['Khmer', 'ផគ្គន់សារៈ: ពិភពលោក, ស្ករ, ទឹកដោឺរ'],
  ])('refuses a %s label the ruleset cannot read', (_label, text) => {
    // Hebrew carries one caution term, "גלוטמט", and no allergen terms at all, so
    // there is nothing to match an allergen against. Guessing here is the one
    // failure mode this app must never have.
    expect(isRulesetReadable(text)).toBe(false);
  });

  it.each([
    ['English', 'INGREDIENTS: wheat flour, sugar, milk solids, salt'],
    ['French', 'Ingrédients: farine de blé, sucre, lait, sel'],
    ['German', 'Zutaten: Weizenmehl, Zucker, Milch, Salz'],
    ['Spanish', 'Ingredientes: harina de trigo, azúcar, leche, sal'],
    ['Italian', 'Ingredienti: farina di grano, zucchero, latte, sale'],
    ['Portuguese', 'Ingredientes: farinha de trigo, açúcar, leite, sal'],
    ['Dutch', 'Ingrediënten: tarwebloem, suiker, melk, zout'],
    ['Vietnamese', 'Thành phần: dầu đậu nành, đường, muối'],
  ])('keeps %s labels readable', (_label, text) => {
    expect(latinLanguageCoverage(text).covered).toBe(true);
    expect(isRulesetReadable(text)).toBe(true);
  });

  it('does not treat a Latin-script but uncatalogued language as readable', () => {
    // Indonesian passes every script check: it is Roman letters, like French.
    // Without the language test it would come back as a trusted SAFE, which is
    // the failure this whole module is built to prevent.
    const indonesian = 'Bahan: minyak kelapa, gula, garam, air';

    expect(profileScripts(indonesian).dominant).toBe('latin');
    expect(latinLanguageCoverage(indonesian).covered).toBe(false);
    expect(isRulesetReadable(indonesian)).toBe(false);
  });

  it('keeps a bilingual pack readable when English carries the minority text', () => {
    const bilingual = 'Ingredients: rice flour, sugar, and vegetable oil, salt, sodium';

    expect(profileScripts(bilingual).dominant).toBe('latin');
    expect(isRulesetReadable(bilingual)).toBe(true);
  });

  it('assumes short ingredient-only text is readable rather than escalating on noise', () => {
    // Too few words for the function-word test to mean anything.
    expect(latinLanguageCoverage('Rice flour, Sugar').covered).toBe(true);
  });

  it('treats pure punctuation or digits as unreadable', () => {
    expect(profileScripts('~~ ~~~ 12345').dominant).toBe('unknown');
    expect(isRulesetReadable('~~ ~~~ 12345')).toBe(false);
  });
});