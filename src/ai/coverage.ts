import { Coverage } from './types';
import { isRulesetReadable } from './scripts';
import { EngineResult, Verdict } from '../rules/types';

/**
 * Decides what coverage a scan is entitled to claim.
 *
 * This used to hold the escalation gate that decided when a model was worth
 * calling. With no model there is nothing to escalate to, so the question it now
 * answers is narrower and more important: is this verdict allowed to be shown as a
 * clean bill of health?
 */

/**
 * Coverage of a scan, decided entirely on device.
 *
 * Note the asymmetry: a CAUTION or UNSAFE verdict from hard-to-read text is still
 * trustworthy, because a false positive merely adds a flag the user can dismiss,
 * whereas a false SAFE is the outcome that can hurt someone. Coverage is therefore
 * only downgraded when the verdict is clean.
 */
export function assessDeterministicCoverage(
  text: string,
  result: EngineResult,
  /**
   * Whether an ingredient header was actually located in the OCR text.
   *
   * The engine cannot infer this: "Toll free 1800-123-4567 / MRP Rs.45.00" parses
   * into two perfectly good ingredient items, so the engine reports sufficient
   * data on a photo of a price sticker. The app already carries this signal from
   * `extractIngredientSection`, and it has to reach coverage too or a nonsense
   * capture gets presented as a trusted result.
   */
  foundHeader?: boolean
): Coverage {
  if (result.insufficientData) return 'unverified';
  if (foundHeader === false) return 'unverified';
  if (!text.trim()) return 'unverified';
  if (!isRulesetReadable(text)) return 'unverified';
  return 'verified';
}

export function isPresentableAsSafe(verdict: Verdict, coverage: Coverage): boolean {
  return verdict === 'safe' && coverage !== 'unverified';
}