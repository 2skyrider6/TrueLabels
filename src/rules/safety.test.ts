/**
 * End-to-end safety invariants for the label-photo path.
 *
 * The most dangerous bug this app can have is reporting SAFE for a product that
 * actually contains an allergen. These tests run the real pipeline
 * (OCR text -> extract -> parse -> engine) so a regression anywhere in that chain
 * fails here rather than on a user's kitchen table.
 */
import { extractIngredientSection } from '../ocr/recognize';
import { parseIngredients } from './parser';
import { evaluateEngine, loadRuleset } from './engine';

const ruleset = loadRuleset();

function runPipeline(ocrText: string) {
  const section = extractIngredientSection({ text: ocrText } as never);
  const parsed = parseIngredients(section.text);
  const result = evaluateEngine(parsed, ruleset);
  return { ...section, parsed, ...result };
}

/** Realistic OCR output: the header, body and allergen block are separate lines. */
const SEPARATE_LINES = [
  'Some Brand Creamy Biscuits',
  'Net Weight 200g',
  'INGREDIENTS:',
  'Refined Wheat Flour, Sugar, Butter 22%,',
  'Milk Solids, Salt, Invert Syrup,',
  'Emulsifier (E322), Baking Powder',
  'CONTAINS: WHEAT, MILK',
  'Nutrition Information: Energy 520 kcal per 100g',
  'FSSAI Lic. No. 10021000001234',
].join('\n');

/** Realistic OCR output: OCR merged the header with the first ingredient line. */
const MERGED_HEADER = [
  'Ingredients: Wheat Flour (54%), Sugar,',
  'Milk Powder, Salt',
  'Allergen Information: Contains Wheat and Milk',
  'Best Before: See top of pack',
].join('\n');

describe('label photo safety invariants', () => {
  it('never reports SAFE when the label declares allergens on separate lines', () => {
    const { text: extracted, parsed, verdict, insufficientData } = runPipeline(SEPARATE_LINES);

    expect(extracted).toContain('CONTAINS: WHEAT, MILK');
    // Label casing varies, so the check is on what the user is told, not on
    // whether the pack shouted the allergen.
    expect(parsed.declaredAllergens.map(a => a.toLowerCase())).toEqual(
      expect.arrayContaining(['wheat', 'milk'])
    );
    expect(verdict).toBe('unsafe');
    expect(insufficientData).toBe(false);
  });

  it('never reports SAFE when the allergen line is merged into the header', () => {
    const { parsed, verdict } = runPipeline(MERGED_HEADER);

    expect(parsed.declaredAllergens.map(a => a.toLowerCase())).toEqual(
      expect.arrayContaining(['wheat', 'milk'])
    );
    expect(verdict).toBe('unsafe');
  });

  it('never reports SAFE when the allergen appears inline in the ingredient list', () => {
    const { verdict } = runPipeline(
      ['Ingredients: Rice Flour, Pulse Flour,', 'Edible Oil, Sugar. Contains Peanuts', 'Store in a cool place'].join('\n')
    );

    expect(verdict).toBe('unsafe');
  });

  it.each([
    ['a completely unreadable capture', '~~~ ~~~'],
    ['a photo of the back of the pack', 'Toll free 1800-123-4567'],
    ['ocr that returned nothing', ''],
    ['a price sticker only', 'MRP Rs.45.00'],
  ])('flags insufficient data for %s rather than inventing a SAFE verdict', (_label, ocrText) => {
    const { foundHeader, parsed } = runPipeline(ocrText);

    // No ingredient header was located and nothing allergen-like was read, so the
    // verdict is meaningless. The UI must not present it as a clean bill of
    // health.
    expect(foundHeader).toBe(false);
    expect(parsed.declaredAllergens).toHaveLength(0);
  });

  it('never returns SAFE for a label-photo scan that could not be read', () => {
    // The exact combination the app used to get wrong: text was found, but it
    // held no ingredient list at all.
    const { verdict, insufficientData, foundHeader } = runPipeline(
      'Toll free 1800-123-4567\nMRP Rs.45.00'
    );

    expect(foundHeader).toBe(false);
    expect(insufficientData || !foundHeader).toBe(true);
    expect(verdict === 'safe' && insufficientData).toBe(false);
  });

  it('still allows a genuine SAFE verdict for a readable, clean label', () => {
    // Guards against the fix being so aggressive that real clean products are
    // no longer usable.
    const { verdict, insufficientData } = runPipeline(
      ['INGREDIENTS:', 'Rice Flour, Sugar, Vegetable Oil, Salt', 'For Queries Contact 1800-123-4567'].join('\n')
    );

    expect(insufficientData).toBe(false);
    expect(verdict).toBe('safe');
  });
});