import { analyze } from '../analyze';
import { presentVerdict } from '../merge';
import { loadRuleset } from '../../rules/engine';
import { EvalCase } from './testset';
import { CaseOutcome } from './metrics';

/**
 * Evaluates the pipeline against the gold set with no network.
 *
 * This is the only tier. It runs in CI on every commit, spends nothing, sends
 * nothing anywhere, and it is the same code path the app runs on a device, so a
 * green gate here means the shipped behaviour is the measured behaviour.
 */
export function runDeterministicTier(cases: EvalCase[]): CaseOutcome[] {
  const ruleset = loadRuleset();

  return cases.map(item => {
    const outcome = analyze(item.text, {
      ruleset,
      ...(item.foundHeader === undefined ? {} : { foundHeader: item.foundHeader }),
    });
    const presentation = presentVerdict(
      outcome.result.verdict,
      outcome.coverage,
      outcome.result.insufficientData
    );

    return {
      id: item.id,
      reportedAllergens: outcome.result.flags.map(flag => flag.id),
      verdict: outcome.result.verdict,
      coverage: outcome.coverage,
      insufficientData: outcome.result.insufficientData,
      verdictTrusted: presentation.verdictTrusted,
    };
  });
}