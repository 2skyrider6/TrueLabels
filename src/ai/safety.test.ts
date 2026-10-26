import { presentVerdict, shouldSuppressSafeVerdict } from './merge';
import { analyze } from './analyze';
import { assessDeterministicCoverage } from './coverage';
import { loadRuleset, evaluateEngine } from '../rules/engine';
import { parseIngredients } from '../rules/parser';
import { Ruleset } from '../rules/types';
import { EVAL_CASES, EVAL_CASES_BY_ID } from './eval/testset';

/**
 * Safety invariants for the analysis pipeline.
 *
 * The contract under test, in order of importance:
 *
 * 1. A label the rule set cannot read is never presented as a trusted SAFE.
 * 2. Coverage is downgraded only when the verdict is clean, because a false
 *    positive costs a dismissal while a false SAFE can cost a hospital visit.
 * 3. Every failure path resolves to "unverified", never to "safe".
 *
 * The tests this file used to hold for merging a model read with a deterministic
 * one are gone because there is no second read. Multilingual coverage is no
 * longer a thing the ruleset fails at and a model rescues; it is something the
 * ruleset does, which is why the recall gate passes with nothing running.
 */

const ruleset: Ruleset = loadRuleset();

describe('an unreadable label is never presented as a trusted verdict', () => {
  const mustAbstain = EVAL_CASES.filter(item => item.requiresAbstention);

  it('has unreadable cases to test against', () => {
    // Three distinct ways to be unable to read a label: an uncovered script, a
    // Latin language the lexicon does not know, and a photo with no ingredient
    // list on it. Without them the abstention metric measures an empty set.
    expect(mustAbstain.length).toBeGreaterThanOrEqual(3);
    expect(new Set(mustAbstain.map(item => item.category)).size).toBeGreaterThanOrEqual(2);
  });

  it.each(mustAbstain.map(item => [item.id, item] as const))(
    'refuses to show %s as a clean bill of health',
    (_id, item) => {
      const outcome = analyze(item.text, {
        ruleset,
        ...(item.foundHeader === undefined ? {} : { foundHeader: item.foundHeader }),
      });
      const presentation = presentVerdict(
        outcome.result.verdict,
        outcome.coverage,
        outcome.result.insufficientData
      );

      // The core invariant, stated once so a regression names itself.
      expect(presentation.verdictTrusted).toBe(false);
      expect(presentation.tone).toBe('neutral');
      expect(outcome.coverage).not.toBe('verified');

      // These cases yield no findings, so the engine reports SAFE. That is
      // precisely why the presentation has to refuse it.
      expect(outcome.result.verdict).toBe('safe');
      expect(shouldSuppressSafeVerdict({ ...outcome.result, coverage: outcome.coverage })).toBe(true);
    }
  );

  it('keeps a finding from an unrecognised language rather than suppressing it', () => {
    // Indonesian is Roman script and is not in the language lexicon, so coverage
    // is unverified. The ruleset still knows "kedelai" as soy, and hiding that
    // behind NOT VERIFIED would throw away a real allergen the engine found.
    const item = EVAL_CASES_BY_ID.get('id-soy-oil')!;
    const outcome = analyze(item.text, { ruleset, foundHeader: true });
    const presentation = presentVerdict(
      outcome.result.verdict,
      outcome.coverage,
      outcome.result.insufficientData
    );

    expect(outcome.coverage).toBe('unverified');
    expect(outcome.result.flags.map(f => f.id)).toContain('allergen:soy');
    expect(presentation.title).toBe('UNSAFE');
    expect(presentation.verdictTrusted).toBe(true);
    expect(presentation.caveat).toMatch(/other allergens/i);
  });

  it('never claims SAFE on a genuinely clean label it cannot read', () => {
    // Indonesian with no allergens is the worst case in the whole set: the answer
    // happens to be right, so nothing would look wrong except the app saying so.
    const item = EVAL_CASES_BY_ID.get('id-clean-control')!;
    const outcome = analyze(item.text, { ruleset, foundHeader: true });
    const presentation = presentVerdict(
      outcome.result.verdict,
      outcome.coverage,
      outcome.result.insufficientData
    );

    expect(outcome.result.verdict).toBe('safe');
    expect(outcome.coverage).toBe('unverified');
    expect(presentation.title).toBe('NOT VERIFIED');
    expect(presentation.verdictTrusted).toBe(false);
  });

  it('reports NOT READ for a photo that never contained an ingredient list', () => {
    const item = EVAL_CASES_BY_ID.get('en-unreadable')!;
    const outcome = analyze(item.text, { ruleset, foundHeader: item.foundHeader });
    const presentation = presentVerdict(
      outcome.result.verdict,
      outcome.coverage,
      outcome.result.insufficientData
    );

    expect(outcome.result.insufficientData).toBe(true);
    expect(presentation.title).toBe('NOT READ');
    expect(presentation.verdictTrusted).toBe(false);
  });

  it('still flags an allergen correctly on an English label', () => {
    const item = EVAL_CASES_BY_ID.get('en-declared-milk-wheat')!;
    const outcome = analyze(item.text, { ruleset });

    expect(outcome.coverage).toBe('verified');
    expect(outcome.result.verdict).toBe('unsafe');
    expect(outcome.result.flags.map(f => f.id)).toEqual(
      expect.arrayContaining(['allergen:wheat', 'allergen:milk'])
    );
  });

  it('keeps the clean-label path fast and trusted', () => {
    const item = EVAL_CASES_BY_ID.get('en-clean-control')!;
    const outcome = analyze(item.text, { ruleset });
    const presentation = presentVerdict(
      outcome.result.verdict,
      outcome.coverage,
      outcome.result.insufficientData
    );

    expect(presentation.verdictTrusted).toBe(true);
    expect(presentation.title).toBe('SAFE');
  });
});

describe('coverage is only downgraded when the verdict is clean', () => {
  it('marks a label it cannot read as unverified', () => {
    const hebrew = 'רכיבים: חיטה, סוכר, מלח';
    const result = evaluateEngine(parseIngredients(hebrew), ruleset);
    const coverage = assessDeterministicCoverage(hebrew, result);

    expect(coverage).toBe('unverified');
  });

  it('still trusts a flag the engine did raise, even unverified', () => {
    // A false positive is a dismissal; a false negative is an ambulance. Presenting
    // a found allergen is always the safer of the two mistakes.
    const presentation = presentVerdict('unsafe', 'unverified', false);

    expect(presentation.tone).toBe('unsafe');
    expect(presentation.title).toBe('UNSAFE');
    expect(presentation.verdictTrusted).toBe(true);
  });

  it('treats a caution verdict the same way', () => {
    const presentation = presentVerdict('caution', 'unverified', false);

    expect(presentation.title).toBe('CAUTION');
    expect(presentation.verdictTrusted).toBe(true);
  });

  it('refuses to trust a clean verdict it did not earn', () => {
    const presentation = presentVerdict('safe', 'unverified', false);

    expect(presentation.title).toBe('NOT VERIFIED');
    expect(presentation.verdictTrusted).toBe(false);
  });

  it('prefers NOT READ over NOT VERIFIED when no text was found', () => {
    // Distinct titles because the two failures need different user action: retake
    // the photo versus check the pack yourself.
    expect(presentVerdict('safe', 'unverified', true).title).toBe('NOT READ');
    expect(presentVerdict('safe', 'unverified', false).title).toBe('NOT VERIFIED');
  });

  it('reads a Hebrew label as unverified even though the engine flagged wheat', () => {
    const hebrew = 'רכיבים: חיטה, סוכר, מלח';
    const outcome = analyze(hebrew, { ruleset, foundHeader: true });
    const presentation = presentVerdict(
      outcome.result.verdict,
      outcome.coverage,
      outcome.result.insufficientData
    );

    expect(outcome.coverage).toBe('unverified');
    expect(presentation.verdictTrusted).toBe(false);
  });

  it('does not spend effort on empty text', () => {
    const outcome = analyze('   ', { ruleset });

    expect(outcome.result.insufficientData).toBe(true);
    expect(outcome.coverage).toBe('unverified');
    expect(outcome.source).toBe('rules');
  });

  it('records the ruleset version a verdict was produced under', () => {
    expect(analyze('INGREDIENTS: sugar', { ruleset }).provenance.rulesetVersion).toBe(
      ruleset.rulesetVersion
    );
  });
});