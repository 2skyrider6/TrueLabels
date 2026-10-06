import { EVAL_CASES, EVAL_CASES_BY_ID } from './testset';
import { runDeterministicTier } from './run';
import { assertReleaseGate, buildReport, formatReport } from './metrics';

/**
 * Offline evaluation, run on every commit with no network.
 *
 * This is the only evaluation tier. There is no model to call and no proxy to
 * deploy: the curated ruleset is the whole analysis path, and it is what gives
 * the app its multilingual coverage.
 *
 * Reaching the release gate required fixing two things that had nothing to do
 * with each other. Recall was short because the term boundaries were ASCII-only,
 * so Devanagari and Arabic terms could never match, and because generic flour
 * words had been catalogued as wheat. The flour problem was the more serious of
 * the two: it produced a false CAUTION on a rice-flour label, which is exactly
 * the kind of noise that teaches someone to ignore a real warning.
 *
 * The two guardrail metrics matter most here. A label the rules cannot read must
 * never be shown as a trusted SAFE verdict, and it must never be guessed at
 * either: unsupported text abstains as NOT VERIFIED, because a wrong answer about
 * someone's allergens is worse than no answer.
 */

const report = buildReport(runDeterministicTier(EVAL_CASES), EVAL_CASES_BY_ID);
const gate = assertReleaseGate(report);

describe('offline evaluation', () => {
  it('prints a metric table complete enough to trend over time', () => {
    console.log('\n' + formatReport(report, gate));
    expect(report.total).toBe(EVAL_CASES.length);
  });

  it('never shows a trusted SAFE verdict it cannot justify', () => {
    expect(report.falseSafeRate).toBe(0);
  });

  it('refuses to present a verdict for every unreadable label', () => {
    expect(report.abstentionRate).toBe(1);
  });

  it('does not regress the existing English-language coverage', () => {
    const english = EVAL_CASES.filter(item => item.language === 'en');
    const englishReport = buildReport(
      runDeterministicTier(english),
      EVAL_CASES_BY_ID
    );
    expect(englishReport.allergenRecall).toBe(1);
  });

  it('meets the recall gate without a model in the loop', () => {
    expect(gate.passed).toBe(true);
  });

  it('does not claim an allergen on a label that has none', () => {
    expect(report.allergenPrecision).toBe(1);
  });

  it('scores recall only over labels it claims to have read', () => {
    // The gold set contains Hebrew and Indonesian cases the ruleset cannot read.
    // Counting their gold allergens as misses would mean the score falls the moment
    // someone correctly adds an unreadable case, so the app is penalised for
    // abstaining rather than guessing. The abstention rate is what scores those.
    const unreadable = EVAL_CASES.filter(item => item.requiresAbstention);

    expect(unreadable.length).toBeGreaterThan(0);
    for (const item of unreadable) {
      const outcome = runDeterministicTier([item])[0];
      expect(outcome.verdictTrusted).toBe(false);
    }

    expect(report.allergenRecall).toBe(1);
  });

  it('counts every language in the gold set as measured', () => {
    // Guards against a language being quietly dropped from the report.
    const languages = Object.keys(report.languages).sort();
    expect(languages.length).toBeGreaterThanOrEqual(8);
    expect(languages).toContain('hi');
    expect(languages).toContain('he');
    expect(languages).toContain('id');
  });
});
