/**
 * Regression tests for the OCR extractor.
 *
 * These exist because a previous version truncated the ingredient block at the
 * words "Contains" and "Allergen". That silently deleted the allergen
 * declaration, so a product whose only allergen evidence was a "CONTAINS: ..."
 * line came back clean.
 */
import { extractIngredientsFromOcr } from './recognize';

const ocr = (text: string) => extractIngredientsFromOcr({ text } as never);

describe('extractIngredientsFromOcr', () => {
  it('keeps a "CONTAINS:" allergen declaration', () => {
    const extracted = ocr(
      [
        'Some Brand Biscuits',
        'INGREDIENTS:',
        'Refined Wheat Flour, Sugar, Butter 22%,',
        'Milk Solids, Salt, Invert Syrup,',
        'Emulsifier (E322), Baking Powder',
        'CONTAINS: WHEAT, MILK',
        'Nutrition Information: Energy 520 kcal',
      ].join('\n')
    );

    expect(extracted).toContain('CONTAINS: WHEAT, MILK');
    expect(extracted).toContain('Refined Wheat Flour');
    expect(extracted).not.toContain('Nutrition Information');
  });

  it('keeps a single-line "Allergen Information: Contains ..." declaration', () => {
    const extracted = ocr(
      [
        'INGREDIENTS: Milk Solids, Edible Vegetable Oil, Salt',
        'Allergen Information: Contains Milk and Soy',
        'Storage: Store in a cool, dry place',
      ].join('\n')
    );

    expect(extracted).toContain('Contains Milk and Soy');
    expect(extracted).not.toContain('Storage');
  });

  it('keeps an inline allergen declaration inside the ingredient list', () => {
    const extracted = ocr(
      [
        'Ingredients: Rice Flour, Pulse Flour,',
        'Edible Vegetable Oil, Salt. Contains Wheat',
        'Nutrition Information: Energy 400 kcal',
      ].join('\n')
    );

    expect(extracted).toContain('Contains Wheat');
    expect(extracted).toContain('Salt');
  });

  it('does not discard the first ingredient line when OCR merges it with the header', () => {
    // OCR often returns the header and the first ingredients on one line. The
    // old extractor skipped the whole line, losing "Wheat Flour".
    const extracted = ocr(
      ['Ingredients: Wheat Flour (54%), Sugar,', 'Salt', 'Best Before: 12/2026'].join('\n')
    );

    expect(extracted).toContain('Wheat Flour (54%)');
    expect(extracted).toContain('Salt');
    expect(extracted).not.toContain('Best Before');
  });

  it('stops at regulatory sections that follow the ingredients', () => {
    const extracted = ocr(
      [
        'INGREDIENTS',
        'Sugar, Wheat Flour, Vegetable Oil',
        'Nutritional Information per 100g',
        'Energy 450 kcal',
        'FSSAI Lic. No. 10021000001234',
      ].join('\n')
    );

    expect(extracted).toContain('Vegetable Oil');
    expect(extracted).not.toContain('Nutritional');
    expect(extracted).not.toContain('FSSAI');
  });

  it('returns the full text when no ingredient header is present', () => {
    // Dropping the text entirely would manufacture an empty, "clean" result.
    const extracted = ocr('Wheat flour, sugar, Contains Soy');

    expect(extracted).toContain('Contains Soy');
  });
});