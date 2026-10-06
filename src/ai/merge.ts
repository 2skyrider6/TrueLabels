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