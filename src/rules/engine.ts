import rulesetJson from './ruleset.json';
import { Ruleset, Rule, Flag, ParsedIngredients, EngineResult, Verdict } from './types';
import { normalize } from './parser';

const SEVERITIES = new Set(['unsafe', 'caution']);
const CATEGORIES = new Set(['allergen', 'additive', 'substance', 'label-warning']);

/**
 * Structurally validates the bundled ruleset.
 *
 * The JSON is imported statically so it is type-checked and bundled, but a typo
 * in a rule id or severity is still invisible to the compiler, so it is checked
 * once at load time instead of being cast blindly.
 */
function validateRuleset(value: unknown): Ruleset {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Ruleset must be an object');
  }

  const candidate = value as Partial<Ruleset>;
  if (typeof candidate.rulesetVersion !== 'string' || !Array.isArray(candidate.rules)) {
    throw new Error('Ruleset is missing rulesetVersion or rules');
  }

  const seenIds = new Set<string>();
  for (const [i, rule] of candidate.rules.entries()) {
    const where = `rules[${i}]`;
    if (typeof rule?.id !== 'string' || !rule.id) throw new Error(`${where} has no id`);
    if (seenIds.has(rule.id)) throw new Error(`${where} duplicates id "${rule.id}"`);
    seenIds.add(rule.id);
    if (!Array.isArray(rule.match) || rule.match.length === 0) {
      throw new Error(`${where} (${rule.id}) has no match terms`);
    }
    if (!SEVERITIES.has(rule.severity)) {
      throw new Error(`${where} (${rule.id}) has invalid severity "${rule.severity}"`);
    }
    if (!CATEGORIES.has(rule.category)) {
      throw new Error(`${where} (${rule.id}) has invalid category "${rule.category}"`);
    }
    if (rule.exclude !== undefined && !Array.isArray(rule.exclude)) {
      throw new Error(`${where} (${rule.id}) has a non-array exclude`);
    }
  }

  return candidate as Ruleset;
}

let cached: Ruleset | null = null;

export function loadRuleset(): Ruleset {
  if (!cached) cached = validateRuleset(rulesetJson);
  return cached;
}

/** Single-character test for a combining mark, i.e. Unicode category Mn/Mc/Me. */
const COMBINING_MARK = /\p{M}/u;

/**
 * Whether a character counts as part of a word for term matching.
 *
 * `\b` is defined in terms of `\w`, which is ASCII-only, so it cannot delimit a
 * Devanagari or Arabic term: `\bगेहूँ\b` never matches, because the space either
 * side is a non-word character and so is `ग`. Regex has no clean Unicode
 * equivalent to `\b`, so the boundary is checked directly over the normalised
 * strings instead.
 *
 * Combining marks are deliberately treated as word *boundaries*. In Brahmic
 * scripts a vowel sign attaches to the consonant before it, so a word can run on
 * without any new letter: the Bengali genitive "গমের" (of wheat) is the letters
 * `গম` plus one vowel sign. Treating the mark as transparent lets the term `গম`
 * match, which is the behaviour a reader expects.
 */
function isWordChar(char: string | undefined): boolean {
  if (char === undefined) return false;
  const code = char.codePointAt(0) as number;
  if (COMBINING_MARK.test(char)) return false;
  if (code >= 97 && code <= 122) return true; // a-z
  if (code >= 65 && code <= 90) return true; // A-Z
  if (code >= 48 && code <= 57) return true; // 0-9
  if (code === 95) return true; // _
  return code > 127;
}

/**
 * Memoised term normalisation.
 *
 * The ruleset now carries roughly 900 match terms, and every one of them is
 * normalised on every ingredient, so without this the cost of a single scan
 * rose by an order of magnitude for a value that never changes. Terms are static
 * bundled data, so the cache never needs invalidating.
 */
const normalizedTermCache = new Map<string, string>();

function normalizeTerm(term: string): string {
  const cached = normalizedTermCache.get(term);
  if (cached !== undefined) return cached;

  const normalized = normalize(term);
  normalizedTermCache.set(term, normalized);
  return normalized;
}

/**
 * Whole-term substring match: the same semantics as `\b<term>\b`, but
 * script-aware.
 *
 * Scans forward until it finds an occurrence with non-word characters on both
 * sides. An occurrence inside a longer word is not a hit, which is what keeps the
 * exclude vetoes meaningful.
 */
function matchesTerm(normalizedIngredient: string, term: string): boolean {
  const normalizedTerm = normalizeTerm(term);
  if (!normalizedTerm) return false;

  let from = 0;
  for (;;) {
    const at = normalizedIngredient.indexOf(normalizedTerm, from);
    if (at === -1) return false;

    const before = normalizedIngredient[at - 1];
    const after = normalizedIngredient[at + normalizedTerm.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;

    from = at + 1;
  }
}

function matchIngredientAgainstRules(normalizedIngredient: string, rules: Rule[]): Rule[] {
  return rules.filter(rule => {
    if (!rule.match.some(term => matchesTerm(normalizedIngredient, term))) return false;
    // A veto term cancels the match: "butter" is milk, but "peanut butter" and
    // "cocoa butter" are not.
    if (rule.exclude?.some(term => matchesTerm(normalizedIngredient, term))) return false;
    return true;
  });
}

interface CollectOptions {
  trace: boolean;
  labelPrefix: string;
}

function collect(
  items: string[],
  ruleset: Ruleset,
  seen: Set<string>,
  options: CollectOptions
): Flag[] {
  const flags: Flag[] = [];

  for (const item of items) {
    const normalized = normalize(item);
    if (!normalized) continue;

    for (const rule of matchIngredientAgainstRules(normalized, ruleset.rules)) {
      if (seen.has(rule.id)) continue;
      seen.add(rule.id);
      flags.push({
        id: rule.id,
        // A cross-contamination mention is never proof of presence, so it is
        // always reported at the weaker severity regardless of the rule.
        severity: options.trace ? 'caution' : rule.severity,
        label: `${options.labelPrefix}${rule.label}`,
        reason: rule.reason,
        category: rule.category,
        crossContamination: options.trace,
      });
    }
  }

  return flags;
}

export function evaluateEngine(
  parsed: ParsedIngredients,
  ruleset: Ruleset
): EngineResult {
  // One dedup set across presence, declaration and trace. Labels routinely list
  // the same allergen twice ("Contains: milk ... May contain: milk"); repeating
  // it as a weaker trace warning adds noise, and the trace line can never upgrade
  // a finding that is already on the label.
  const seen = new Set<string>();

  const allFlags: Flag[] = [
    ...collect(parsed.ingredients, ruleset, seen, { trace: false, labelPrefix: '' }),
    // A definitive "Contains: milk" keeps the rule's own severity. Downgrading a
    // declared allergen into a cross-contamination caution is the one mistake
    // this app cannot make.
    ...collect(parsed.declaredAllergens, ruleset, seen, { trace: false, labelPrefix: '' }),
    ...collect(parsed.mayContain, ruleset, seen, { trace: true, labelPrefix: 'May contain: ' }),
  ];

  // Derived from the flags, never from the raw list, so an unmatched "may
  // contain" line cannot produce a CAUTION banner with nothing behind it.
  const verdict: Verdict = allFlags.some(f => f.severity === 'unsafe')
    ? 'unsafe'
    : allFlags.length > 0
      ? 'caution'
      : 'safe';

  allFlags.sort((a, b) => {
    const severityOrder = { unsafe: 0, caution: 1 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Nothing readable came off the label. "safe" here would be a guess, and a
  // guess that a product is allergen-free is the most dangerous output this app
  // can produce.
  const insufficientData =
    parsed.ingredients.length === 0 &&
    parsed.declaredAllergens.length === 0 &&
    parsed.mayContain.length === 0;

  return { flags: allFlags, verdict, insufficientData };
}
