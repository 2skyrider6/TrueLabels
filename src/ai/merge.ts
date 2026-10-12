import { Coverage } from './types';
import { Verdict } from '../rules/types';

/**
 * Presentation of a verdict to the user.
 *
 * The merge helpers that used to live here combined a deterministic read with a
 * model read. With no model there is nothing to merge, so this module is down to
 * the one thing that matters: refusing to let an unverified verdict look clean.
 */

export interface SafetyPresentation {
  tone: 'unsafe' | 'caution' | 'safe' | 'neutral';
  title: string;
  /**
   * False when the underlying verdict must not be read as a clean bill of health.
   * The UI hides allergen-free styling entirely when this is false.
   */
  verdictTrusted: boolean;
  /** Copy explaining why the result is not being trusted. */
  caveat?: string;
}

/**
 * The guardrail that turns an unverified verdict into visible uncertainty.
 *
 * This is the single most important function in the feature. A SAFE verdict from
 * an unreadable label is exactly the failure that causes an allergic reaction, so
 * a clean result the pipeline did not earn is forced to a neutral, explicitly
 * uncertain presentation.
 *
 * The asymmetry is deliberate and load-bearing: unverified coverage suppresses
 * only a *clean* verdict. A CAUTION or UNSAFE the engine did raise is still shown,
 * even when it cannot vouch for the rest of the label. A false positive costs the
 * user one dismissal; hiding an allergen that was genuinely found costs them the
 * warning entirely, so the engine's findings are never suppressed.
 */
export function presentVerdict(
  verdict: Verdict,
  coverage: Coverage,
  insufficientData: boolean
): SafetyPresentation {
  if (insufficientData) {
    return {
      tone: 'neutral',
      title: 'NOT READ',
      verdictTrusted: false,
      caveat: 'No ingredient text could be read from this label.',
    };
  }

  const unverifiedCaveat =
    coverage === 'unverified'
      ? 'Part of this label could not be read, so check the pack for other allergens.'
      : undefined;

  if (verdict === 'unsafe') {
    return { tone: 'unsafe', title: 'UNSAFE', verdictTrusted: true, caveat: unverifiedCaveat };
  }

  if (verdict === 'caution') {
    return { tone: 'caution', title: 'CAUTION', verdictTrusted: true, caveat: unverifiedCaveat };
  }

  if (coverage === 'unverified') {
    return {
      tone: 'neutral',
      title: 'NOT VERIFIED',
      verdictTrusted: false,
      caveat:
        'This label is written in a language the offline rule set cannot read, so no verdict has been confirmed.',
    };
  }

  return { tone: 'safe', title: 'SAFE', verdictTrusted: true };
}

/** True when a SAFE verdict must not be shown as a clean bill of health. */
export function shouldSuppressSafeVerdict(scan: {
  verdict: Verdict;
  coverage: Coverage;
  insufficientData: boolean;
}): boolean {
  return scan.verdict === 'safe' && !presentVerdict(scan.verdict, scan.coverage, scan.insufficientData).verdictTrusted;
}

/**
 * The 0-100 score the SafetyMeter renders.
 *
 * This is presentation only. `presentVerdict` remains the single gate that
 * decides whether a result may look clean, and the verdict remains the
 * authoritative signal — the meter never overrides an UNSAFE the engine raised.
 *
 * Two properties are load-bearing and must not be relaxed:
 *
 * 1. A label that could not be read, or could not be read *in a language the
 *    rule set covers*, can never score as safe. Missing ingredient text is not
 *    a clean bill of health, so both are held in the critical band.
 * 2. The band boundaries match the meter's own colour zones, so the score can
 *    never render green while the verdict reads UNSAFE or NOT VERIFIED.
 */
export function safetyScore(input: {
  verdict: Verdict;
  coverage: Coverage;
  insufficientData: boolean;
  /** Number of flags the engine raised. More flags strictly lower the score. */
  flagCount: number;
}): number {
  const { verdict, coverage, insufficientData, flagCount } = input;

  // Nothing was read at all: the meter has nothing to report.
  if (insufficientData) return 0;

  // Critical band: 0-39, rendered red by the meter.
  const critical = Math.max(8, 32 - flagCount * 2);
  // Moderate band: 40-69, rendered amber.
  const moderate = Math.min(68, 55 + flagCount);
  // Pure band: 70-100, rendered green.
  const pure = Math.max(70, 96 - flagCount * 2);

  // An unreadable-language label and a real UNSAFE are both critical, so a
  // "safe" verdict that the pipeline could not verify never lands in green.
  if (coverage === 'unverified' || verdict === 'unsafe') return critical;
  if (verdict === 'caution') return moderate;
  return pure;
}