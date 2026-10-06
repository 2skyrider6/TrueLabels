/**
 * Ruleset integrity and the engine's boundary behaviour.
 *
 * `engine.test.ts` already pins matching semantics and the shipped ruleset. This
 * file covers two things it does not:
 *
 * - Structural validation. `validateRuleset` runs at import time, so a typo in
 *   ruleset.json is a crash on app start rather than a bad flag. It is only
 *   reachable through the module's cache, so each case loads a fresh copy.
 * - The `insufficientData` contract, which decides whether a result is allowed to
 *   claim a verdict at all.
 */
import { parseIngredients } from './parser';
import type { Rule, Ruleset } from './types';

const parsed = (over: Partial<ReturnType<typeof parseIngredients>> = {}) => ({
  ingredients: [],
  declaredAllergens: [],
  mayContain: [],
  ...over,
});

type EngineModule = typeof import('./engine');

/**
 * Loads the engine with both the module registry and the ruleset mock cleared, so
 * validation runs again and each case gets its own copy of the cached ruleset.
 *
 * `jest.resetModules` alone is not enough: a `doMock` of ruleset.json from an
 * earlier case would otherwise be reused by every later one, quietly testing a
 * stub ruleset instead of the shipped one.
 */
function loadEngine(rulesetJson?: unknown): EngineModule {
  if (rulesetJson === undefined) {
    jest.dontMock('./ruleset.json');
  } else {
    jest.doMock('./ruleset.json', () => ({ __esModule: true, default: rulesetJson }));
  }

  let mod!: EngineModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./engine') as EngineModule;
  });
  return mod;
}

function rule(over: Partial<Rule> = {}): Rule {
  return {
    id: 'allergen:test',
    match: ['test'],
    severity: 'unsafe',
    label: 'Test',
    reason: 'test',
    category: 'allergen',
    ...over,
  };
}

function ruleset(rules: Rule[], version = '1.0.0-test'): Ruleset {
  return { rulesetVersion: version, rules };
}

beforeEach(() => {
  jest.resetModules();
  jest.dontMock('./ruleset.json');
});

describe('validateRuleset', () => {
  it('accepts a well-formed ruleset', () => {
    const { loadRuleset } = loadEngine(ruleset([rule()]));

    expect(loadRuleset().rulesetVersion).toBe('1.0.0-test');
  });

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['a number', 7],
    ['a boolean', true],
  ])('rejects %s as not an object', (_label, value) => {
    const { loadRuleset } = loadEngine(value);

    expect(() => loadRuleset()).toThrow('Ruleset must be an object');
  });

  it('rejects an array, albeit with the shape message', () => {
    // `typeof [] === 'object'`, so an array slips past the first guard and is
    // caught by the missing-rules check. Either way it throws at load rather
    // than yielding a half-valid ruleset.
    const { loadRuleset } = loadEngine([]);

    expect(() => loadRuleset()).toThrow('missing rulesetVersion or rules');
  });

  it('rejects a ruleset with no version', () => {
    const { loadRuleset } = loadEngine({ rules: [rule()] });

    expect(() => loadRuleset()).toThrow('missing rulesetVersion or rules');
  });

  it('rejects a ruleset with no rules array', () => {
    const { loadRuleset } = loadEngine({ rulesetVersion: '1.0.0' });

    expect(() => loadRuleset()).toThrow('missing rulesetVersion or rules');
  });

  it('rejects a rule with no id', () => {
    const { loadRuleset } = loadEngine(ruleset([rule({ id: '' })]));

    expect(() => loadRuleset()).toThrow('rules[0] has no id');
  });

  it('rejects duplicate rule ids, which would make dedupe drop a finding', () => {
    // The engine keys `seen` on id, so a duplicate silently hides the second
    // rule's evidence.
    const { loadRuleset } = loadEngine(ruleset([rule(), rule({ label: 'Other' })]));

    expect(() => loadRuleset()).toThrow('duplicates id "allergen:test"');
  });

  it('rejects a rule with no match terms', () => {
    const { loadRuleset } = loadEngine(ruleset([rule({ match: [] })]));

    expect(() => loadRuleset()).toThrow('has no match terms');
  });

  it.each(['critical', 'warning', 'Unsafe', ''])('rejects severity %p', severity => {
    const { loadRuleset } = loadEngine(ruleset([rule({ severity: severity as never })]));

    expect(() => loadRuleset()).toThrow(/invalid severity/);
  });

  it.each(['allergens', 'dye', 'Substance'])('rejects category %p', category => {
    const { loadRuleset } = loadEngine(ruleset([rule({ category: category as never })]));

    expect(() => loadRuleset()).toThrow(/invalid category/);
  });

  it('rejects a non-array exclude list', () => {
    const { loadRuleset } = loadEngine(ruleset([rule({ exclude: 'peanut butter' as never })]));

    expect(() => loadRuleset()).toThrow('has a non-array exclude');
  });

  it('names the offending index so the culprit is findable', () => {
    const { loadRuleset } = loadEngine(ruleset([rule(), rule({ id: 'x', match: [] })]));

    expect(() => loadRuleset()).toThrow('rules[1] (x) has no match terms');
  });

  it('caches a valid ruleset rather than re-validating on every call', () => {
    // The screens call this at module scope, so it has to be cheap and stable.
    const { loadRuleset } = loadEngine(ruleset([rule()]));

    expect(loadRuleset()).toBe(loadRuleset());
  });
});

describe('insufficientData', () => {
  it('is true only when nothing at all could be read', () => {
    const { evaluateEngine: evaluate } = loadEngine(ruleset([rule()]));

    expect(evaluate(parsed(), ruleset([rule()])).insufficientData).toBe(true);
  });

  it.each([
    ['an ingredient with no rule match', { ingredients: ['Rice'] }],
    ['a declaration', { declaredAllergens: ['Milk'] }],
    ['a trace', { mayContain: ['Nuts'] }],
  ])('is false when there is %s', (_label, input) => {
    const { evaluateEngine: evaluate } = loadEngine(ruleset([rule()]));

    expect(evaluate(parsed(input), ruleset([rule()])).insufficientData).toBe(false);
  });

  it('reports insufficientData only when the parser produced nothing at all', () => {
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const shipped = loadRuleset();

    expect(evaluate(parseIngredients(''), shipped).insufficientData).toBe(true);
    expect(evaluate(parseIngredients('   '), shipped).insufficientData).toBe(true);
  });

  it('does not treat unreadable pack text as insufficient data on its own', () => {
    // Worth recording precisely, because it explains why the label-photo screen
    // carries its own guard. A photo of the back of the pack parses into two
    // plausible ingredient lines ("Toll free 1800-123-4567", "MRP Rs.45.00"),
    // so `insufficientData` stays false and the verdict comes out 'safe'.
    //
    // The engine cannot tell that from a real list, so the protection lives in
    // `app/label-scan.tsx`, which sets `insufficientData` when OCR never located
    // an ingredient header. Both halves are pinned here and there.
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const shipped = loadRuleset();

    const result = evaluate(parseIngredients('Toll free 1800-123-4567\nMRP Rs.45.00'), shipped);

    expect(result.insufficientData).toBe(false);
    expect(result.verdict).toBe('safe');
    expect(result.flags).toEqual([]);
  });

  it('leaves the presentation decision to the UI: the engine still reports a verdict', () => {
    // Worth being explicit about. With nothing read, `collect` finds no flags
    // and the verdict mechanically falls out as 'safe' alongside
    // `insufficientData: true`. The engine is a pure function and does not
    // override the verdict; the result screen is what refuses to show a green
    // banner. Asserting the pairing here keeps that split deliberate, and
    // `app/result.test.tsx` pins the UI half.
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(parseIngredients(''), loadRuleset());

    expect(result).toEqual({ flags: [], verdict: 'safe', insufficientData: true });
  });

  it('lets a genuine safe verdict through, so the guard is not blanket', () => {
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(parseIngredients('Rice Flour, Sugar, Salt'), loadRuleset());

    expect(result.insufficientData).toBe(false);
    expect(result.verdict).toBe('safe');
  });
});

describe('verdict derivation', () => {
  it('derives the verdict from the flags, not from the raw input', () => {
    // A trace of an allergen nothing else matches must not manufacture a caution
    // banner with no finding behind it.
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(parsed({ ingredients: ['Rice'], mayContain: ['Celery'] }), loadRuleset());

    expect(result.flags).toEqual([]);
    expect(result.verdict).toBe('safe');
  });

  it('is unsafe when any single flag is unsafe, however many cautions accompany it', () => {
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(
      parsed({ ingredients: ['Milk', 'MSG', 'Palm Oil', 'Hydrogenated Oil'] }),
      loadRuleset()
    );

    expect(result.verdict).toBe('unsafe');
    expect(result.flags.filter(flag => flag.severity === 'unsafe')).toHaveLength(1);
  });

  it('sorts every unsafe finding ahead of every caution finding', () => {
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(
      parsed({ ingredients: ['MSG', 'Soy', 'Palm Oil', 'E951'] }),
      loadRuleset()
    );

    const severities = result.flags.map(flag => flag.severity);
    const firstCaution = severities.indexOf('caution');
    const lastUnsafe = severities.lastIndexOf('unsafe');

    expect(firstCaution === -1 || lastUnsafe < firstCaution).toBe(true);
  });

  it('reports each rule at most once across presence, declaration and trace', () => {
    // Labels routinely name the same allergen twice, and a trace can never
    // upgrade a finding that is already on the label.
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(
      parsed({
        ingredients: ['Milk Solids'],
        declaredAllergens: ['Milk'],
        mayContain: ['Milk'],
      }),
      loadRuleset()
    );

    expect(result.flags.filter(flag => flag.id === 'allergen:milk')).toHaveLength(1);
    expect(result.flags[0].severity).toBe('unsafe');
  });

  it('keeps a declaration at rule severity and marks it as present, not a trace', () => {
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const [flag] = evaluate(parsed({ declaredAllergens: ['Peanuts'] }), loadRuleset()).flags;

    expect(flag.severity).toBe('unsafe');
    expect(flag.crossContamination).toBe(false);
    expect(flag.label).toBe('Peanut');
  });

  it('downgrades a trace to caution even when the rule is unsafe', () => {
    // Cross-contamination is never proof of presence.
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const [flag] = evaluate(parsed({ ingredients: ['Rice'], mayContain: ['Peanuts'] }), loadRuleset())
      .flags;

    expect(flag.severity).toBe('caution');
    expect(flag.crossContamination).toBe(true);
    expect(flag.label).toBe('May contain: Peanut');
  });

  it('reports a trace of a different allergen alongside the declaration', () => {
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(
      parsed({ declaredAllergens: ['Milk'], mayContain: ['Peanuts'] }),
      loadRuleset()
    );

    expect(result.verdict).toBe('unsafe');
    expect(result.flags.map(flag => [flag.id, flag.severity])).toEqual([
      ['allergen:milk', 'unsafe'],
      ['allergen:peanut', 'caution'],
    ]);
  });

  it('copies reason, category and label onto every flag', () => {
    // The result screen renders these directly, so a flag missing one would show
    // a blank row.
    const { evaluateEngine: evaluate, loadRuleset } = loadEngine();
    const result = evaluate(parsed({ ingredients: ['Milk'] }), loadRuleset());

    for (const flag of result.flags) {
      expect(flag.label).not.toBe('');
      expect(flag.reason).not.toBe('');
      expect(['allergen', 'additive', 'substance', 'label-warning']).toContain(flag.category);
    }
  });
});

describe('exclusion semantics', () => {
  it('lets a veto term cancel a match', () => {
    const { evaluateEngine: evaluate } = loadEngine();
    const custom = ruleset([rule({ match: ['butter'], exclude: ['peanut butter'] })]);

    expect(evaluate(parsed({ ingredients: ['Butter'] }), custom).flags).toHaveLength(1);
    expect(evaluate(parsed({ ingredients: ['Peanut Butter'] }), custom).flags).toHaveLength(0);
  });

  it('does not match a term as a substring of a longer word', () => {
    // "Nut" must not fire on "Coconut", and "BHA" must not fire on "Bhasha".
    const { evaluateEngine: evaluate } = loadEngine();
    const custom = ruleset([rule({ match: ['nut'] }), rule({ id: 'x', match: ['bha'] })]);

    const result = evaluate(parsed({ ingredients: ['Coconut', 'Bhaji'] }), custom);

    expect(result.flags).toEqual([]);
  });

  it('matches across a hyphen or space, since labels use both', () => {
    const { evaluateEngine: evaluate } = loadEngine();
    const custom = ruleset([rule({ match: ['milk solids'] })]);

    expect(evaluate(parsed({ ingredients: ['Milk Solids'] }), custom).flags).toHaveLength(1);
  });

  it('applies the exclusion even when the veto term appears after the match', () => {
    const { evaluateEngine: evaluate } = loadEngine();
    const custom = ruleset([rule({ match: ['butter'], exclude: ['shea'] })]);

    expect(evaluate(parsed({ ingredients: ['Shea Butter'] }), custom).flags).toHaveLength(0);
  });
});