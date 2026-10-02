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

function matchesTerm(normalizedIngredient: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(normalizedIngredient);
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
