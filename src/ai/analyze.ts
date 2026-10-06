import { AnalysisSource, AiProvenance, Coverage } from './types';
import { assessDeterministicCoverage } from './coverage';
import { profileScripts } from './scripts';
import { EngineResult, ParsedIngredients, Ruleset } from '../rules/types';
import { evaluateEngine, loadRuleset } from '../rules/engine';
import { parseIngredients } from '../rules/parser';

/**
 * The analysis pipeline. There is one tier.
 *
 * This was a two-tier orchestrator that called a model over the network whenever
 * the rule set could not read a label. With multilingual coverage in the bundled
 * ruleset there is nothing left for a model to do, and keeping a tier that can
 * only ever return `unverified` would have been cost without benefit.
 *
 * The function is total: every input produces a verdict, and the unreadable case
 * degrades to "not verified" rather than to "safe".
 */

export interface AnalyzeOutcome {
  parsed: ParsedIngredients;
  result: EngineResult;
  coverage: Coverage;
  source: AnalysisSource;
  provenance: AiProvenance;
  /** Dominant script of the text, recorded for the result screen's disclosure. */
  language: string;
  /** Human-readable note describing how the verdict was reached. */
  escalation: string;
}

function runDeterministic(text: string, ruleset: Ruleset) {
  const parsed = parseIngredients(text);
  const result = evaluateEngine(parsed, ruleset);
  return { parsed, result };
}

/**
 * Applies the OCR header signal to an engine result.
 *
 * The engine cannot tell that "Toll free 1800-123-4567 / MRP Rs.45.00" is a price
 * sticker, because that text parses into two perfectly valid ingredient items. The
 * app has always folded this signal in via `insufficientData || (fromOcr &&
 * !foundHeader)`; doing it here keeps the result screen agreeing about whether a
 * label was read at all.
 */
function applyHeaderSignal(
  result: EngineResult,
  foundHeader: boolean | undefined
): EngineResult {
  if (foundHeader !== false || result.insufficientData) return result;
  return { ...result, insufficientData: true };
}

export function analyze(
  text: string,
  options: { ruleset?: Ruleset; foundHeader?: boolean } = {}
): AnalyzeOutcome {
  const ruleset = options.ruleset ?? loadRuleset();
  const { parsed, result: raw } = runDeterministic(text, ruleset);
  const result = applyHeaderSignal(raw, options.foundHeader);
  const coverage = assessDeterministicCoverage(text, result, options.foundHeader);
  const source: AnalysisSource = result.insufficientData ? 'none' : 'rules';

  return {
    parsed,
    result,
    coverage,
    source,
    provenance: { coverage, source, rulesetVersion: ruleset.rulesetVersion },
    language: profileScripts(text).dominant,
    escalation:
      coverage === 'verified'
        ? 'Checked against the bundled allergen ruleset, on this device.'
        : 'The rule set could not read this label, so no verdict was confirmed.',
  };
}