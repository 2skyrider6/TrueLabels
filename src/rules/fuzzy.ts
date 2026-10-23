/**
 * Fuzzy string matching for OCR typo tolerance.
 *
 * OCR frequently misreads ingredients: "whea" instead of "wheat",
 * "mellk" instead of "milk", "soyа" instead of "soya". Exact whole-word
 * matching misses these. Fuzzy matching with Levenshtein distance catches
 * near-misses while exclude vetoes prevent false positives.
 *
 * Match confidence hierarchy:
 * - Exact match:        confidence 1.0
 * - Levenshtein ≤ 1:    confidence 0.7  (single-character OCR typo)
 * - Levenshtein ≤ 2 + long words: confidence 0.5 (two-char typo on long word)
 * - No match:           confidence 0
 *
 * Exclude vetoes always override matches: "butter" matches milk, but
 * "peanut butter" matches the exclude "peanut" and is not flagged.
 */

/**
 * Computes Levenshtein edit distance between two strings.
 * Space-optimized to O(min(m,n)) using two rolling rows.
 * Suitable for short ingredient words (< 40 chars).
 */
export function levenshteinDistance(a: string, b: string): number {
  let m = a.length;
  let n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Ensure b is the shorter string for space optimization
  let str1 = a;
  let str2 = b;
  if (m < n) {
    str1 = str2;
    str2 = a;
    const tmp = m;
    m = n;
    n = tmp;
  }

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ch1 = str1[i - 1];
    for (let j = 1; j <= n; j++) {
      if (ch1 === str2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(
          prev[j] + 1,     // deletion
          curr[j - 1] + 1, // insertion
          prev[j - 1] + 1  // substitution
        );
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Match confidence levels for ingredient-to-rule-term matching.
 */
export type MatchConfidenceLevel = 'exact' | 'fuzzy' | 'partial' | 'none';

/**
 * Result of matching a single ingredient against a single rule term.
 */
export interface TermMatchResult {
  matched: boolean;
  confidence: number;
  matchType: MatchConfidenceLevel;
  matchedTerm: string;
  distance: number;
}

/**
 * Match a single ingredient against a single rule term.
 *
 * @param ingredient - Normalized ingredient text
 * @param ruleTerm - Normalized rule match term
 * @returns Match result with confidence score
 */
export function matchTerm(ingredient: string, ruleTerm: string): TermMatchResult {
  // Exact match
  if (ingredient === ruleTerm) {
    return {
      matched: true,
      confidence: 1.0,
      matchType: 'exact',
      matchedTerm: ruleTerm,
      distance: 0,
    };
  }

  const dist = levenshteinDistance(ingredient, ruleTerm);
  const maxLen = Math.max(ingredient.length, ruleTerm.length);

  // Fuzzy match: single-character difference (OCR typo)
  if (dist === 1) {
    return {
      matched: true,
      confidence: 0.7,
      matchType: 'fuzzy',
      matchedTerm: ruleTerm,
      distance: 1,
    };
  }

  // Partial match: two-character difference on longer words only
  // Prevents "cat" matching "bat" etc.
  if (dist === 2 && maxLen >= 5) {
    return {
      matched: true,
      confidence: 0.5,
      matchType: 'partial',
      matchedTerm: ruleTerm,
      distance: 2,
    };
  }

  return {
    matched: false,
    confidence: 0,
    matchType: 'none',
    matchedTerm: ruleTerm,
    distance: dist,
  };
}

/**
 * Find the best match for an ingredient against a list of rule terms.
 * Returns the highest-confidence match or null if nothing matches.
 */
export function bestTermMatch(
  ingredient: string,
  ruleTerms: string[]
): TermMatchResult | null {
  let best: TermMatchResult | null = null;

  for (const term of ruleTerms) {
    const result = matchTerm(ingredient, term);
    if (result.matched && (!best || result.confidence > best.confidence)) {
      best = result;
    }
  }

  return best;
}

/**
 * Confidence thresholds for verdict decisions.
 *
 * These thresholds ensure that only confident matches contribute to
 * safety-critical verdicts. Low-confidence fuzzy matches are recorded
 * but don't upgrade a verdict to UNSAFE.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Minimum confidence for any match to be considered at all */
  MIN_MATCH: 0.5,
  /** Minimum confidence for a match to contribute to an UNSAFE verdict */
  MIN_UNSAFE: 0.7,
  /** Minimum confidence for a match to contribute to a CAUTION verdict */
  MIN_CAUTION: 0.7,
} as const;

/**
 * Determine if a match confidence is high enough to trigger a verdict of the
 * given severity.
 */
export function confidenceTriggersVerdict(
  confidence: number,
  severity: 'unsafe' | 'caution' | 'safe'
): boolean {
  const threshold =
    severity === 'unsafe'
      ? CONFIDENCE_THRESHOLDS.MIN_UNSAFE
      : CONFIDENCE_THRESHOLDS.MIN_CAUTION;
  return confidence >= threshold;
}

/**
 * Result of matching an ingredient against all rules.
 */
export interface RuleMatchResult {
  rule: import('./types').Rule;
  confidence: number;
  matchType: MatchConfidenceLevel;
  matchedTerm: string;
}

/**
 * Match an ingredient against all rules in a ruleset, returning matches with
 * confidence scores. Exclude vetoes are checked first.
 *
 * @param ingredient - Normalized ingredient text
 * @param rules - Array of rules from the ruleset
 * @returns Array of matched rules with confidence scores
 */
export function matchIngredientAgainstRules(
  ingredient: string,
  rules: import('./types').Rule[]
): RuleMatchResult[] {
  const results: RuleMatchResult[] = [];

  for (const rule of rules) {
    // Check exclude vetoes first - exact substring match on exclude terms
    if (rule.exclude && rule.exclude.some(term => ingredient.includes(term.toLowerCase()))) {
      continue;
    }

    // Try fuzzy match against each match term
    let bestConfidence = 0;
    let bestMatchType: MatchConfidenceLevel = 'none';
    let bestMatchedTerm = '';

    for (const term of rule.match) {
      const result = matchTerm(ingredient, term.toLowerCase());
      if (result.matched && result.confidence > bestConfidence) {
        bestConfidence = result.confidence;
        bestMatchType = result.matchType;
        bestMatchedTerm = result.matchedTerm;
      }
    }

    if (bestConfidence > 0) {
      results.push({
        rule,
        confidence: bestConfidence,
        matchType: bestMatchType,
        matchedTerm: bestMatchedTerm,
      });
    }
  }

  return results;
}