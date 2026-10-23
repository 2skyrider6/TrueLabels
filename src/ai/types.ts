/**
 * Shared vocabulary for the analysis pipeline.
 *
 * This file used to describe a contract between the rules engine and a cloud
 * model, and it carried the full wire format for a streaming endpoint. There is
 * no model and no endpoint: the curated ruleset is the whole analysis path, which
 * is what makes the feature free to run and impossible to leak label data from.
 *
 * The two unions below are deliberately narrow. They previously included an
 * `assisted` coverage and a `rules+ai` source, describing a state this app can no
 * longer reach. Leaving unreachable values in a type used by the safety path is
 * how code comes to reason about outcomes that cannot happen, so they are gone.
 */

/** Where a verdict's underlying evidence came from. */
export type AnalysisSource = 'rules' | 'web';

/**
 * How much confidence the pipeline has that it actually *read* the label.
 *
 * `unverified` is the load-bearing value. It means the rule set could not read
 * this label's language, or no ingredient text was found at all, so a clean
 * verdict must never be rendered as a bill of health.
 */
export type Coverage = 'verified' | 'unverified';

/**
 * Where a stored verdict came from, kept alongside the scan so an old row can be
 * interpreted after the ruleset has moved on.
 */
export interface AiProvenance {
  coverage: Coverage;
  source: AnalysisSource;
  /** Ruleset version the verdict was produced with. */
  rulesetVersion?: string;
}