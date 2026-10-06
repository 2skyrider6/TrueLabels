import { Verdict } from '../../rules/types';
import { Coverage } from '../types';
import { presentVerdict } from '../merge';
import { isRulesetReadable } from '../scripts';

/**
 * Metrics for the label-analysis pipeline.
 *
 * They are deliberately asymmetric. `falseSafeRate` is the headline number and
 * is the only one with a hard release gate at zero, because every other error
 * mode costs a user a minute of their time while this one can send an allergic
 * person to hospital. Precision and false-positive rate are tracked too, but
 * they are treated as cost and UX metrics rather than safety ones.
 */

export interface CaseOutcome {
  id: string;
  reportedAllergens: string[];
  verdict: Verdict;
  coverage: Coverage;
  insufficientData: boolean;
  /** True when the UI would show a trusted verdict. */
  verdictTrusted: boolean;
}

export interface EvalReport {
  total: number;
  /**
   * Share of gold allergens that were found, over labels the pipeline claims to
   * have read. Measured over cases that declare at least one allergen, so a run
   * of clean controls cannot inflate it. Cases the ruleset cannot read are
   * excluded rather than counted as misses, because abstaining on those is the
   * required behaviour and the abstention rate measures it directly.
   */
  allergenRecall: number;
  /** Share of reported allergens that are real. */
  allergenPrecision: number;
  /**
   * Share of cases reported SAFE while gold says otherwise, or reported as
   * trusted when the label was unreadable. Release gate: must be 0.
   */
  falseSafeRate: number;
  /** Share of unreadable labels that correctly refused to show a trusted verdict. */
  abstentionRate: number;
  /** Dominant script of each case, for spotting coverage gaps. */
  languages: Record<string, number>;
  failures: string[];
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function buildReport(outcomes: CaseOutcome[], expected: Map<string, {
  expectedAllergens: string[];
  requiresAbstention: boolean;
  category: string;
  language: string;
}>): EvalReport {
  let expectedAllergenCount = 0;
  let recalled = 0;
  let reportedAllergenCount = 0;
  let correctAllergenCount = 0;

  let falseSafe = 0;
  let abstainCandidates = 0;
  let abstained = 0;
  const languages: Record<string, number> = Object.create(null);
  const failures: string[] = [];

  for (const outcome of outcomes) {
    const gold = expected.get(outcome.id);
    if (!gold) {
      failures.push(`${outcome.id}: outcome has no matching gold case`);
      continue;
    }

    const reported = new Set(outcome.reportedAllergens);

    // Recall and precision only score labels the pipeline claims to have read.
    // A case the gold set marks `requiresAbstention` is one it cannot read, so
    // scoring its gold allergens as misses would penalise the app for refusing
    // rather than guessing — and the metric would fall the moment someone
    // correctly added an unreadable case. The abstention rate is what holds those
    // cases to account.
    if (!gold.requiresAbstention) {
      for (const allergen of gold.expectedAllergens) {
        expectedAllergenCount++;
        if (reported.has(allergen)) recalled++;
      }
      reportedAllergenCount += reported.size;
      for (const allergen of reported) {
        if (gold.expectedAllergens.includes(allergen)) correctAllergenCount++;
      }
    }

    // A case fails when it is presented as a clean, trusted SAFE verdict and it
    // should not be. Both halves matter: a wrong allergen that stays unreadable
    // is a UX cost, not a safety one.
    const presentation = presentVerdict(
      outcome.verdict,
      outcome.coverage,
      outcome.insufficientData
    );
    const goldShouldBeSafe =
      gold.expectedAllergens.length === 0 && gold.category !== 'unreadable';

    if (outcome.verdictTrusted && outcome.verdict === 'safe' && !goldShouldBeSafe) {
      falseSafe++;
      failures.push(
        `${outcome.id}: trusted SAFE presented but gold has ` +
          `${gold.expectedAllergens.join(', ') || 'no readable text'}`
      );
    }

    if (gold.requiresAbstention) {
      abstainCandidates++;
      if (!presentation.verdictTrusted || outcome.coverage !== 'verified') abstained++;
    }

    languages[gold.language] = (languages[gold.language] ?? 0) + 1;
  }

  return {
    total: outcomes.length,
    allergenRecall: rate(recalled, expectedAllergenCount),
    allergenPrecision: rate(correctAllergenCount, reportedAllergenCount),
    falseSafeRate: rate(falseSafe, outcomes.length),
    abstentionRate: rate(abstained, abstainCandidates),
    languages,
    failures,
  };
}

/** Release gate. A regression in any of these blocks the rollout. */
export interface GateResult {
  passed: boolean;
  violations: string[];
}

export function assertReleaseGate(report: EvalReport, minRecall = 0.95): GateResult {
  const violations: string[] = [];

  if (report.falseSafeRate > 0) {
    violations.push(
      `falseSafeRate ${(report.falseSafeRate * 100).toFixed(1)}% must be 0 ` +
        `(${report.failures.filter(f => f.includes('trusted SAFE')).length} cases)`
    );
  }
  if (report.allergenRecall < minRecall) {
    violations.push(
      `allergenRecall ${(report.allergenRecall * 100).toFixed(1)}% is below the ${(minRecall * 100).toFixed(0)}% gate`
    );
  }
  if (report.abstentionRate < 1) {
    violations.push(
      `abstentionRate ${(report.abstentionRate * 100).toFixed(1)}% must be 100%: ` +
        'every unreadable label has to refuse a trusted verdict'
    );
  }

  return { passed: violations.length === 0, violations };
}

/** Human-readable summary for CI logs. */
export function formatReport(report: EvalReport, gate: GateResult): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return [
    `cases                    ${report.total}`,
    `allergen recall          ${pct(report.allergenRecall)}`,
    `allergen precision       ${pct(report.allergenPrecision)}`,
    `false-safe rate          ${pct(report.falseSafeRate)}   (gate: 0%)`,
    `abstention rate          ${pct(report.abstentionRate)}   (gate: 100%)`,
    `release gate             ${gate.passed ? 'PASS' : 'FAIL'}`,
    ...gate.violations.map(v => `  - ${v}`),
  ].join('\n');
}

export { isRulesetReadable };
