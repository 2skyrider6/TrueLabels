import { evaluateEngine, loadRuleset } from './engine';
import { parseIngredients } from './parser';
import { ParsedIngredients, Rule, Severity } from './types';

const mockRuleset = {
  rulesetVersion: '1.0.0-test',
  rules: [
    {
      id: 'allergen:milk',
      match: ['milk', 'milk solids', 'casein', 'lactose', 'whey', 'paneer', 'ghee'],
      severity: 'unsafe' as Severity,
      label: 'Milk',
      reason: 'FSSAI requires milk to be declared; this is a common allergen.',
      category: 'allergen' as const,
    },
    {
      id: 'allergen:wheat',
      match: ['wheat', 'wheat flour', 'maida', 'gluten', 'semolina'],
      severity: 'unsafe' as Severity,
      label: 'Wheat/gluten',
      reason: 'FSSAI requires wheat to be declared; gluten affects celiac individuals.',
      category: 'allergen' as const,
    },
    {
      id: 'additive:aspartame',
      match: ['aspartame', 'e951'],
      severity: 'unsafe' as Severity,
      label: 'Aspartame',
      reason: 'FSSAI requires phenylalanine warning for aspartame.',
      category: 'additive' as const,
    },
    {
      id: 'caution:palm_oil',
      match: ['palm oil', 'palmolein'],
      severity: 'caution' as Severity,
      label: 'Palm oil',
      reason: 'Commonly unwanted; environmental and health concerns.',
      category: 'substance' as const,
    },
    {
      id: 'caution:msg',
      match: ['msg', 'monosodium glutamate'],
      severity: 'caution' as Severity,
      label: 'MSG',
      reason: 'Commonly unwanted; may cause sensitivity.',
      category: 'substance' as const,
    },
  ],
} as { rulesetVersion: string; rules: Rule[] };

const parsed = (over: Partial<ParsedIngredients> = {}): ParsedIngredients => ({
  ingredients: [],
  declaredAllergens: [],
  mayContain: [],
  ...over,
});

describe('evaluateEngine', () => {
  test('returns safe for empty ingredients', () => {
    const result = evaluateEngine(parsed(), mockRuleset);
    expect(result.verdict).toBe('safe');
    expect(result.flags).toEqual([]);
  });

  test('detects milk allergen', () => {
    const result = evaluateEngine(parsed({ ingredients: ['Milk'] }), mockRuleset);
    expect(result.verdict).toBe('unsafe');
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].id).toBe('allergen:milk');
    expect(result.flags[0].severity).toBe('unsafe');
  });

  test('detects multiple allergens', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Milk', 'Wheat Flour'] }),
      mockRuleset
    );
    expect(result.verdict).toBe('unsafe');
    expect(result.flags).toHaveLength(2);
  });

  test('detects aspartame', () => {
    const result = evaluateEngine(parsed({ ingredients: ['Aspartame'] }), mockRuleset);
    expect(result.verdict).toBe('unsafe');
    expect(result.flags[0].id).toBe('additive:aspartame');
  });

  test('detects palm oil as caution', () => {
    const result = evaluateEngine(parsed({ ingredients: ['Palm Oil'] }), mockRuleset);
    expect(result.verdict).toBe('caution');
    expect(result.flags[0].severity).toBe('caution');
  });

  test('detects MSG as caution', () => {
    const result = evaluateEngine(parsed({ ingredients: ['MSG'] }), mockRuleset);
    expect(result.verdict).toBe('caution');
    expect(result.flags[0].id).toBe('caution:msg');
  });

  test('an unmatched "may contain" line does not force a caution verdict', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Sugar'], mayContain: ['Celery'] }),
      mockRuleset
    );
    expect(result.verdict).toBe('safe');
    expect(result.flags).toEqual([]);
  });

  test('unsafe takes precedence over caution', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Milk', 'Palm Oil'] }),
      mockRuleset
    );
    expect(result.verdict).toBe('unsafe');
    expect(result.flags[0].severity).toBe('unsafe');
  });

  test('deduplicates the same flag from multiple ingredients', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Milk', 'Milk Solids'] }),
      mockRuleset
    );
    expect(result.flags).toHaveLength(1);
  });

  test('case insensitive matching', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['MILK', 'milk', 'Milk'] }),
      mockRuleset
    );
    expect(result.flags).toHaveLength(1);
  });

  test('word boundary matching prevents substring false positives', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Doughnut', 'Caramel'] }),
      mockRuleset
    );
    expect(result.flags).toHaveLength(0);
    expect(result.verdict).toBe('safe');
  });

  test('sorts flags by severity', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Palm Oil', 'Milk'] }),
      mockRuleset
    );
    expect(result.flags[0].severity).toBe('unsafe');
    expect(result.flags[1].severity).toBe('caution');
  });

  test('a declared allergen keeps the rule severity and is not marked as a trace', () => {
    const result = evaluateEngine(parsed({ declaredAllergens: ['Milk'] }), mockRuleset);
    expect(result.verdict).toBe('unsafe');
    expect(result.flags[0].severity).toBe('unsafe');
    expect(result.flags[0].crossContamination).toBe(false);
    expect(result.flags[0].label).toBe('Milk');
  });

  test('mayContain downgrades to caution and is labelled as a trace', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Sugar'], mayContain: ['Milk'] }),
      mockRuleset
    );
    expect(result.verdict).toBe('caution');
    expect(result.flags[0].id).toBe('allergen:milk');
    expect(result.flags[0].severity).toBe('caution');
    expect(result.flags[0].crossContamination).toBe(true);
    expect(result.flags[0].label).toBe('May contain: Milk');
  });

  test('a trace of an ingredient that is also present is not double reported', () => {
    const result = evaluateEngine(
      parsed({ ingredients: ['Milk'], mayContain: ['Milk'] }),
      mockRuleset
    );
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].severity).toBe('unsafe');
  });

  test('a trace of a different allergen is still reported alongside the declaration', () => {
    // "Contains: milk" plus "May contain: wheat" are two distinct findings, and
    // the trace must keep the weaker severity even though the verdict is unsafe.
    const result = evaluateEngine(
      parsed({ declaredAllergens: ['Milk'], mayContain: ['Wheat'] }),
      mockRuleset
    );
    expect(result.verdict).toBe('unsafe');
    expect(result.flags.map(f => f.severity)).toEqual(['unsafe', 'caution']);
    expect(result.flags[1].crossContamination).toBe(true);
  });

  test('exclude terms veto a match', () => {
    const ruleset: { rulesetVersion: string; rules: Rule[] } = {
      rulesetVersion: 'test',
      rules: [
        {
          id: 'allergen:milk',
          match: ['butter'],
          exclude: ['peanut butter'],
          severity: 'unsafe',
          label: 'Milk',
          reason: 'test',
          category: 'allergen',
        },
      ],
    };
    expect(evaluateEngine(parsed({ ingredients: ['Butter'] }), ruleset).flags).toHaveLength(1);
    expect(
      evaluateEngine(parsed({ ingredients: ['Peanut Butter'] }), ruleset).flags
    ).toHaveLength(0);
  });
});

describe('loadRuleset', () => {
  test('returns a structurally valid ruleset', () => {
    const ruleset = loadRuleset();
    expect(typeof ruleset.rulesetVersion).toBe('string');
    expect(ruleset.rules.length).toBeGreaterThan(0);
    const ids = ruleset.rules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// These run the ruleset that actually ships. The mock-based tests above cannot
// catch a bad term in ruleset.json, which is where the false positives lived.
describe('shipped ruleset behaviour', () => {
  const ruleset = loadRuleset();
  const idsFor = (text: string) =>
    evaluateEngine(parseIngredients(text), ruleset).flags.map(f => f.id);

  test('flags declared dairy allergens as unsafe', () => {
    expect(idsFor('Milk, Sugar, Contains: Wheat, Soy')).toEqual(
      expect.arrayContaining(['allergen:milk', 'allergen:wheat', 'allergen:soy'])
    );
  });

  test('"Contains: soy" is unsafe, not a cross-contamination caution', () => {
    const result = evaluateEngine(
      parseIngredients('Ingredients: Sugar, Salt. Contains: Soy'),
      ruleset
    );
    expect(result.verdict).toBe('unsafe');
    const soy = result.flags.find(f => f.id === 'allergen:soy');
    expect(soy?.severity).toBe('unsafe');
    expect(soy?.crossContamination).toBe(false);
  });

  test('a "may contain" allergen is caution and cross-contamination', () => {
    const result = evaluateEngine(
      parseIngredients('Water, Sugar. May contain: Milk'),
      ruleset
    );
    expect(result.verdict).toBe('caution');
    expect(result.flags[0].crossContamination).toBe(true);
  });

  describe('does not flag these as dairy', () => {
    // "Butter Chicken" is intentionally absent: the seasoning mix does contain
    // dairy butter, so flagging milk is the correct result.
    test.each(['Peanut Butter', 'Almond Butter', 'Cocoa Butter', 'Apple Butter'])(
      '%s',
      text => {
        expect(idsFor(text)).not.toContain('allergen:milk');
      }
    );
  });

  test('flags genuine dairy butter', () => {
    expect(idsFor('Butter')).toContain('allergen:milk');
    expect(idsFor('Butter Chicken Seasoning Mix')).toContain('allergen:milk');
  });

  describe('does not flag these as soy', () => {
    test.each(['Sunflower Lecithin, Sugar', 'Rapeseed Lecithin'])('%s', text => {
      expect(idsFor(text)).not.toContain('allergen:soy');
    });
  });

  test('flags soy lecithin when the source is declared', () => {
    expect(idsFor('Lecithin (soya)')).toContain('allergen:soy');
  });

  test('does not treat "tsp" (teaspoon) as textured soy protein', () => {
    expect(idsFor('Add 1 tsp of salt')).not.toContain('allergen:soy');
  });

  test('flags textured soy protein', () => {
    expect(idsFor('Textured Soy Protein')).toContain('allergen:soy');
  });

  test('does not flag plant-based creams and milks as dairy', () => {
    expect(idsFor('Coconut Cream')).not.toContain('allergen:milk');
    expect(idsFor('Oat Milk')).not.toContain('allergen:milk');
    expect(idsFor('Cream of Tartar')).not.toContain('allergen:milk');
  });

  test('does not flag a "0 g trans fat" claim as hydrogenated oil', () => {
    expect(idsFor('Nutrition: 0 g Trans Fat')).not.toContain('caution:hydrogenated_oil');
  });

  test('does not flag "natural colour" as an artificial colour', () => {
    expect(idsFor('Natural Colour Added')).not.toContain('caution:artificial_colour');
  });

  describe('matches generic allergen classes', () => {
    test.each([
      ['Nuts', 'allergen:tree_nuts'],
      ['Tree Nuts', 'allergen:tree_nuts'],
      ['mixed nuts', 'allergen:tree_nuts'],
      ['Crustaceans', 'allergen:crustacean'],
    ])('"may contain: %s"', (text, expected) => {
      expect(idsFor(`Water, Sugar. May contain: ${text}`)).toContain(expected);
    });
  });

  test('does not confuse peanuts or water chestnut with tree nuts', () => {
    expect(idsFor('Peanuts')).not.toContain('allergen:tree_nuts');
    expect(idsFor('Water Chestnut')).not.toContain('allergen:tree_nuts');
  });

  test('E-numbers map to exactly one rule each', () => {
    expect(idsFor('E951')).toEqual(['additive:aspartame']);
    expect(idsFor('E950')).toEqual(['additive:saccharin']);
    expect(idsFor('E952')).toEqual(['additive:cyclamate']);
  });

  // Regressions found by running the engine against 15 real product labels.
  test('does not flag an ingredient labelled "gluten-free" as wheat', () => {
    expect(idsFor('Oats (gluten-free), Water, Salt')).not.toContain('allergen:wheat');
    expect(idsFor('Rice Flour (gluten free)')).not.toContain('allergen:wheat');
    expect(idsFor('Oat Flour, Certified Gluten Free')).not.toContain('allergen:wheat');
  });

  test('still flags wheat when the word gluten is a real source', () => {
    expect(idsFor('Wheat Flour, Salt')).toContain('allergen:wheat');
    expect(idsFor('Malt Extract')).toContain('allergen:wheat');
  });

  test('flags the singular "soybean"', () => {
    expect(idsFor('Vegetable Oil (Soybean, Sunflower)')).toContain('allergen:soy');
  });

  test('maps US colour names to their rules', () => {
    expect(idsFor('Yellow 5')).toContain('additive:tartrazine');
    expect(idsFor('Yellow 6')).toContain('additive:sunset_yellow');
    expect(idsFor('Red 40')).toContain('caution:artificial_colour');
  });

  test('keeps a parenthesised additive in one piece', () => {
    expect(idsFor('Antioxidant (E320)')).toContain('additive:bha');
  });

  test('an empty label is safe', () => {
    const result = evaluateEngine(parseIngredients(''), ruleset);
    expect(result.verdict).toBe('safe');
    expect(result.flags).toEqual([]);
  });
});

// Open Food Facts returns ingredient text in whatever language the product was
// entered in. Reporting SAFE for a French product that plainly contains hazelnuts
// and milk is the worst failure this app can make, so each language is pinned.
describe('non-English labels are still analysed', () => {
  const ruleset = loadRuleset();
  const idsFor = (text: string) =>
    evaluateEngine(parseIngredients(text), ruleset).flags.map(f => f.id);

  test('French: hazelnuts, milk and soy are detected', () => {
    const ids = idsFor(
      'Sucre, huile de palme, NOISETTES 13%, cacao maigre 7,4%, LAIT écrémé en poudre ' +
        '6,6%, LACTOSERUM en poudre, émulsifiant (lécithine de soja), vanilline.'
    );
    expect(ids).toEqual(expect.arrayContaining(['allergen:tree_nuts', 'allergen:milk', 'allergen:soy']));
  });

  test('Spanish: a hyphenated E-number still matches', () => {
    expect(idsFor('Agua carbonatada, azucar, colorante (E-150d), acido fosforico')).toContain(
      'additive:caramel_colour'
    );
  });

  test('German: wheat, milk, egg, soy and tartrazine are detected', () => {
    const ids = idsFor('Weizenmehl, Milch, Käse, Butter, Eier, Soja, Salz, Farbstoffe (E102)');
    expect(ids).toEqual(
      expect.arrayContaining([
        'allergen:wheat',
        'allergen:milk',
        'allergen:egg',
        'allergen:soy',
        'additive:tartrazine',
      ])
    );
  });

  test('German compound forms are detected', () => {
    expect(idsFor('Zucker, Milchpulver, Salz')).toContain('allergen:milk');
  });

  test('Italian: the trace statement is classified, not swallowed into ingredients', () => {
    const parsed = parseIngredients(
      'Semola di grano duro. Può contenere tracce di: latte, uova, soia, frutta a guscio.'
    );
    expect(parsed.ingredients).toEqual(['Semola di grano duro']);
    expect(parsed.mayContain.length).toBe(4);
    const ids = evaluateEngine(parsed, ruleset).flags.map(f => f.id);
    expect(ids).toEqual(
      expect.arrayContaining(['allergen:wheat', 'allergen:milk', 'allergen:egg', 'allergen:soy', 'allergen:tree_nuts'])
    );
  });

  test('Portuguese and Dutch nut names are detected', () => {
    expect(idsFor('Avela, acucar, sal')).toContain('allergen:tree_nuts');
    expect(idsFor('Hazelnoot, suiker, zout')).toContain('allergen:tree_nuts');
  });

  test('a plain non-allergen foreign ingredient is still safe', () => {
    expect(idsFor('Zucker, Salz, Wasser')).toEqual([]);
    expect(idsFor('Azucar, sal, agua carbonatada')).toEqual([]);
  });
});
