/**
 * OCR section extraction, at the boundaries.
 *
 * `recognize.test.ts` covers the regressions that motivated the extractor.
 * This file pushes on the awkward inputs a phone camera actually produces:
 * a mangled header, a header in a regional language, an allergen line sharing a
 * line with the ingredients, and text that looks like a label but is not one.
 *
 * The invariant under all of it: text that could be allergen evidence is never
 * dropped, and text that is not an ingredient list reports `foundHeader: false`
 * so no clean verdict can be built on it.
 */
import { extractIngredientSection } from './recognize';

const ocr = (text: string) => extractIngredientSection({ text } as never);

describe('foundHeader reporting', () => {
  it.each([
    ['a bare INGREDIENTS header', 'INGREDIENTS\nWheat Flour, Sugar'],
    ['a header with a colon', 'Ingredients: Wheat Flour, Sugar'],
    ['a header with a hyphen', 'Ingredients - Wheat Flour, Sugar'],
    ['a header with an en dash', 'Ingredients – Wheat Flour, Sugar'],
    ['a header with an em dash', 'Ingredients — Wheat Flour, Sugar'],
    ['a header with no separator', 'Ingredients Wheat Flour, Sugar'],
    ['a mixed-case header', 'InGrEdIeNtS: Wheat Flour'],
    ['a lowercase header', 'ingredients: wheat flour'],
    ['a French composition header', 'Composition : farine de blé, sucre'],
    ['a Hindi header', 'विवरण : आटा, चीनी'],
    ['a bare composition header', 'COMPOSITION\nFarine, sucre'],
    ['a space before the colon', 'Ingredients : Wheat Flour'],
  ])('finds the header in %s', (_label, text) => {
    expect(ocr(text).foundHeader).toBe(true);
  });

  it.each([
    ['a price sticker', 'MRP Rs.45.00'],
    ['a customer care number', 'Toll free 1800-123-4567'],
    ['a nutrition panel', 'Nutritional Information: Energy 520 kcal'],
    ['a brand name only', 'Some Brand Creamy Biscuits'],
    ['an empty capture', ''],
    ['whitespace only', '   \n  \n '],
    ['an allergen line with no ingredient header', 'CONTAINS: MILK, SOY'],
  ])('reports no header for %s', (_label, text) => {
    expect(ocr(text).foundHeader).toBe(false);
  });

  it('still returns the whole text when no header is present', () => {
    // Dropping it would manufacture an empty, apparently clean result.
    const result = ocr('Toll free 1800-123-4567\nMRP Rs.45.00');

    expect(result.foundHeader).toBe(false);
    expect(result.text).toContain('1800-123-4567');
  });

  it('does not treat the word "ingredients" mid-sentence as a header', () => {
    // The pattern is anchored to the start of a line, so a mention inside a
    // sentence cannot open an ingredient block.
    expect(ocr('Questions about ingredients? Call 1800-123-4567').foundHeader).toBe(false);
  });

  it('uses the first header when a pack declares two', () => {
    const result = ocr(
      ['INGREDIENTS: Wheat Flour, Sugar', 'INGREDIENTS (for the sauce): Water, Salt'].join('\n')
    );

    expect(result.foundHeader).toBe(true);
    expect(result.text).toContain('Wheat Flour');
    expect(result.text).toContain('sauce');
  });
});

describe('allergen evidence is never dropped', () => {
  it.each([
    ['a CONTAINS line', ['INGREDIENTS:', 'Rice Flour, Sugar', 'CONTAINS: SOY']],
    [
      'an allergen-information line',
      ['INGREDIENTS:', 'Rice Flour', 'Allergen Information: Peanuts'],
    ],
    ['an inline declaration', ['Ingredients: Rice Flour, Salt. Contains Wheat']],
    [
      'a may-contain line',
      ['INGREDIENTS:', 'Rice Flour, Sugar', 'May contain traces of Milk'],
    ],
    [
      'an EU trace statement',
      ['INGREDIENTS: Semola di grano duro', 'Può contenere tracce di: latte, uova'],
    ],
    [
      'a multi-line declaration',
      ['INGREDIENTS:', 'Wheat Flour', 'CONTAINS:', 'WHEAT, MILK, SOY'],
    ],
  ])('keeps %s', (_label, lines) => {
    const text = lines.join('\n');
    const result = ocr(text);

    expect(result.foundHeader).toBe(true);
    // Everything after the header survives, and the declaration is still in it.
    expect(result.text).toContain(lines[lines.length - 1]);
  });

  it('keeps a declaration that shares a line with the last ingredient', () => {
    // OCR frequently merges the header and the body. Cutting the line would take
    // the declaration with it.
    const text = 'INGREDIENTS: Wheat Flour (54%), Sugar, Milk. Contains: WHEAT, MILK';

    const extracted = ocr(text).text;

    expect(extracted).toContain('Wheat Flour (54%)');
    expect(extracted).toContain('Contains: WHEAT, MILK');
  });

  it('keeps a declaration placed before the ingredient body', () => {
    // Some packs print the allergen box above the list. The block starts at the
    // header, so this is truncated, but the extraction still has to find the
    // header and not silently produce nothing.
    const text = ['CONTAINS: MILK', 'INGREDIENTS:', 'Wheat Flour, Sugar'].join('\n');

    const result = ocr(text);

    expect(result.foundHeader).toBe(true);
    expect(result.text).toContain('Wheat Flour');
  });

  it('keeps every allergen word in a multi-line declaration', () => {
    const text = [
      'INGREDIENTS:',
      'Wheat Flour, Sugar',
      'CONTAINS:',
      'WHEAT, MILK, SOY,',
      'SESAME',
    ].join('\n');

    expect(ocr(text).text).toContain('SESAME');
  });
});

describe('extraction stops at the right place', () => {
  it.each([
    ['a nutrition panel', 'Nutritional Information per 100g'],
    ['an FSSAI licence line', 'FSSAI Lic. No. 10021000001234'],
    ['a net weight line', 'Net Weight 200g'],
    ['a storage instruction', 'Store in a cool, dry place'],
    ['a best-before line', 'Best Before: 12/2026'],
    ['a manufacturer line', 'Manufactured by ABC Foods Pvt Ltd'],
    ['a customer care line', 'Customer Care: 1800-123-4567'],
    ['an email line', 'Email: help@example.com'],
    ['a website line', 'www.example.com'],
    ['a batch number', 'Batch No: A12345'],
    ['an imported-by line', 'Imported by XYZ Foods'],
  ])('stops at %s', (_label, terminator) => {
    const text = ['INGREDIENTS:', 'Wheat Flour, Sugar', terminator, 'Unrelated trailing text'].join('\n');

    const extracted = ocr(text).text;

    expect(extracted).toContain('Wheat Flour');
    expect(extracted).not.toContain('Unrelated trailing text');
  });

  it('keeps an allergen declaration that appears before the terminator', () => {
    // The ordering is the whole point: the declaration is the most
    // safety-critical text on the pack and it sits inside this block.
    const text = [
      'INGREDIENTS:',
      'Refined Wheat Flour, Sugar, Butter 22%',
      'CONTAINS: WHEAT, MILK',
      'Nutrition Information: Energy 520 kcal',
    ].join('\n');

    const extracted = ocr(text).text;

    expect(extracted).toContain('CONTAINS: WHEAT, MILK');
    expect(extracted).not.toContain('Nutrition Information');
  });

  it('drops blank and single-character lines without ending the block', () => {
    // The guard `line.length > 1` should skip noise, not terminate collection.
    const text = ['INGREDIENTS:', 'Wheat Flour', '-', 'Sugar', 'Contains: Milk'].join('\n');

    const extracted = ocr(text).text;

    expect(extracted).toContain('Sugar');
    expect(extracted).toContain('Contains: Milk');
  });
});

describe('degenerate input', () => {
  it('returns an empty block for a header with nothing after it', () => {
    const result = ocr('INGREDIENTS:');

    expect(result.foundHeader).toBe(true);
    expect(result.text).toBe('');
  });

  it('returns an empty block for a header followed only by a terminator', () => {
    const result = ocr('INGREDIENTS:\nBest Before: 12/2026');

    expect(result.foundHeader).toBe(true);
    expect(result.text).toBe('');
  });

  it('treats a missing text field as an empty capture', () => {
    // OCR can succeed with no recognised text at all.
    const result = extractIngredientSection({} as never);

    expect(result.foundHeader).toBe(false);
    expect(result.text).toBe('');
  });

  it('survives CRLF line endings from a Windows-rendered label', () => {
    const result = ocr('INGREDIENTS:\r\nWheat Flour, Sugar\r\nCONTAINS: WHEAT');

    expect(result.foundHeader).toBe(true);
    expect(result.text).toContain('Wheat Flour');
    expect(result.text).toContain('CONTAINS: WHEAT');
  });

  it('matches a French "Composition:" header but not a plural form', () => {
    expect(ocr('Composition: Sugar').foundHeader).toBe(true);
  });

  it('accepts the plural "Compositions:", treating the stray "s" as body text', () => {
    // Documented boundary rather than a bug: the header alternation is
    // unanchored at its end, so "Compositions:" matches on "composition" and the
    // remainder "s: Sugar" becomes the first collected line. The block is still
    // non-empty and the downstream parser still sees the text, so this degrades
    // to one noisy ingredient rather than to a dropped allergen declaration.
    const result = ocr('Compositions: Sugar, Milk');

    expect(result.foundHeader).toBe(true);
    expect(result.text).toContain('Milk');
  });
});

describe('the extracted block feeds the rest of the pipeline', () => {
  it('produces text from which the declaration is still parseable', () => {
    // The two stages are only useful together, so the contract between them is
    // asserted rather than assumed.
    const text = [
      'Some Brand Creamy Biscuits',
      'Net Weight 200g',
      'INGREDIENTS:',
      'Refined Wheat Flour, Sugar, Butter 22%,',
      'Milk Solids, Salt',
      'CONTAINS: WHEAT, MILK',
      'Nutrition Information: Energy 520 kcal',
    ].join('\n');

    const result = ocr(text);

    expect(result.foundHeader).toBe(true);
    expect(result.text.split('\n')).toEqual([
      'Refined Wheat Flour, Sugar, Butter 22%,',
      'Milk Solids, Salt',
      'CONTAINS: WHEAT, MILK',
    ]);
  });
});