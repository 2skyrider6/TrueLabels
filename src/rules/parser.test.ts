import { parseIngredients, normalize } from './parser';

describe('normalize', () => {
  test('lowercases text', () => {
    expect(normalize('MILK')).toBe('milk');
  });

  test('strips diacritics', () => {
    expect(normalize('café')).toBe('cafe');
    expect(normalize('naïve')).toBe('naive');
  });

  test('replaces punctuation with spaces', () => {
    expect(normalize('milk, sugar')).toBe('milk sugar');
    expect(normalize('milk; sugar')).toBe('milk sugar');
    expect(normalize('milk (pasteurized)')).toBe('milk pasteurized');
    expect(normalize('milk**')).toBe('milk');
  });

  test('collapses whitespace', () => {
    expect(normalize('milk   sugar')).toBe('milk sugar');
    expect(normalize('  milk  ')).toBe('milk');
  });

  test('unifies hyphenated and spaced E-numbers', () => {
    expect(normalize('E-150d')).toBe('e150d');
    expect(normalize('E 150d')).toBe('e150d');
    expect(normalize('e102')).toBe('e102');
  });

  test('does not mangle words that merely start with e', () => {
    expect(normalize('egg')).toBe('egg');
    expect(normalize('emulsifier')).toBe('emulsifier');
  });
});

describe('parseIngredients', () => {
  test('empty input returns empty arrays', () => {
    expect(parseIngredients('')).toEqual({
      ingredients: [],
      declaredAllergens: [],
      mayContain: [],
    });
  });

  test('splits on commas', () => {
    const result = parseIngredients('Milk, Sugar, Wheat');
    expect(result.ingredients).toEqual(['Milk', 'Sugar', 'Wheat']);
  });

  test('splits on semicolons', () => {
    const result = parseIngredients('Milk; Sugar; Wheat');
    expect(result.ingredients).toEqual(['Milk', 'Sugar', 'Wheat']);
  });

  test('strips emphasis markers', () => {
    expect(parseIngredients('**Milk**, Sugar, **Wheat**').ingredients).toEqual([
      'Milk',
      'Sugar',
      'Wheat',
    ]);
  });

  test('line breaks separate ingredients rather than merging them', () => {
    // OCR returns the list one ingredient per line. Newlines are kept as section
    // boundaries so a following allergen header stays detectable, and each line
    // remains its own ingredient instead of being fused into one string.
    const result = parseIngredients('Milk\nSugar\nWheat');
    expect(result.ingredients).toEqual(['Milk', 'Sugar', 'Wheat']);
  });

  test('handles single ingredient', () => {
    expect(parseIngredients('Milk').ingredients).toEqual(['Milk']);
  });

  test('keeps parentheses attached to their ingredient', () => {
    const result = parseIngredients('Milk (pasteurized), Sugar');
    expect(result.ingredients).toEqual(['Milk (pasteurized)', 'Sugar']);
  });

  test('keeps a qualified ingredient in one piece', () => {
    const result = parseIngredients('Soy Lecithin (E322), Sugar, Salt');
    expect(result.ingredients).toEqual(['Soy Lecithin (E322)', 'Sugar', 'Salt']);
  });

  test('drops the leading "Ingredients:" label but keeps the items', () => {
    const result = parseIngredients('Ingredients: Water, Sugar, Salt.');
    expect(result.ingredients).toEqual(['Water', 'Sugar', 'Salt']);
  });

  test('keeps every item instead of collapsing to one blob when a sub-list exists', () => {
    const result = parseIngredients('Pasta: durum wheat semolina. Sauce: water, tomato.');
    expect(result.ingredients).toEqual(['durum wheat semolina', 'water', 'tomato']);
  });

  test('keeps items that appear before a sub-list label', () => {
    const result = parseIngredients('Salt, Spices. Masala: chilli, turmeric');
    expect(result.ingredients).toEqual(['Salt', 'Spices', 'chilli', 'turmeric']);
  });

  test('truncates at manufacturer metadata', () => {
    const result = parseIngredients(
      'Ingredients: Water, Sugar. Manufacturer: ABC Foods Ltd, Plot 4, Sector 9.'
    );
    expect(result.ingredients).toEqual(['Water', 'Sugar']);
  });

  test('truncates at the nutrition panel', () => {
    const result = parseIngredients(
      'Ingredients: Water, Sugar, Salt. Nutrition Information: Energy 100 kcal'
    );
    expect(result.ingredients).toEqual(['Water', 'Sugar', 'Salt']);
  });
});

describe('allergen statement classification', () => {
  test('"Contains:" is a declaration, not cross-contamination', () => {
    const result = parseIngredients('Milk, Sugar, Contains: Wheat, Soy');
    expect(result.ingredients).toEqual(['Milk', 'Sugar']);
    expect(result.declaredAllergens).toEqual(['Wheat', 'Soy']);
    expect(result.mayContain).toEqual([]);
  });

  test('"May contain:" is cross-contamination', () => {
    const result = parseIngredients('Milk, Sugar, May contain: Nuts, Soy');
    expect(result.ingredients).toEqual(['Milk', 'Sugar']);
    expect(result.mayContain).toEqual(['Nuts', 'Soy']);
    expect(result.declaredAllergens).toEqual([]);
  });

  test('declaration without a colon is still recognised after a full stop', () => {
    const result = parseIngredients('Wheat Flour, Salt. Contains Wheat and Soy');
    expect(result.declaredAllergens).toEqual(['Wheat', 'Soy']);
  });

  test('keeps declarations and traces separate when both are present', () => {
    const result = parseIngredients('Milk, Sugar, Contains: Soy. May contain: Nuts');
    expect(result.declaredAllergens).toHaveLength(1);
    expect(result.declaredAllergens[0]).toMatch(/^Soy/);
    expect(result.mayContain).toEqual(['Nuts']);
  });

  test('prose "contains gluten" inside an ingredient is not a declaration', () => {
    const result = parseIngredients(
      'Ingredients: Water, Wheat Flour (contains gluten), Salt. Contains: Wheat, Soy.'
    );
    expect(result.declaredAllergens).toEqual(['Wheat', 'Soy.']);
    expect(result.ingredients).toEqual(['Water', 'Wheat Flour (contains gluten)', 'Salt']);
  });

  test('"Allergen Note" nests a declaration and a trace statement', () => {
    const result = parseIngredients(
      'Noodles: Wheat Flour, Salt, Masala: Salt, Spices, ' +
        'Allergen Note: Contains Wheat & Nut. May contain Milk, Mustard, Oats And Soy'
    );
    expect(result.declaredAllergens).toEqual(['Wheat', 'Nut.']);
    expect(result.mayContain).toEqual(['Milk', 'Mustard', 'Oats', 'Soy']);
    expect(result.ingredients).toEqual([
      'Wheat Flour',
      'Salt',
      'Salt',
      'Spices',
    ]);
  });

  test('tolerates a typo before "CONTAINS:"', () => {
    const result = parseIngredients('Milk, Sugar, MAYA CONTAINS: Nuts');
    expect(result.ingredients).toEqual(['Milk', 'Sugar', 'MAYA']);
    expect(result.declaredAllergens).toEqual(['Nuts']);
    expect(result.mayContain).toEqual([]);
  });

  test('does not mistake a sub-list name for an allergen statement', () => {
    const result = parseIngredients('Pasta: durum wheat semolina. Sauce: water, tomato.');
    expect(result.declaredAllergens).toEqual([]);
    expect(result.mayContain).toEqual([]);
  });

  test('deduplicates repeated items', () => {
    const result = parseIngredients('Milk, Sugar, May contain: Nuts, nuts, NUTS');
    expect(result.mayContain).toEqual(['Nuts']);
  });
});
