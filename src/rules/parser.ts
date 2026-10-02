import { ParsedIngredients } from './types';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // "E-150d", "E 150d" and "e150d" are the same additive, so the separator is
    // removed before punctuation is stripped. Without this a hyphenated E-number
    // normalises to "e 150d" and matches no rule.
    .replace(/\be[\s-]*(?=\d)/g, 'e')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1');
}

/**
 * Allergen section header keywords, including the wording used on EU labels.
 * `may contain` is listed before `contains` so the longer, more specific phrase
 * wins the alternation. Accented forms are spelled out because the scan runs on
 * the raw label text, not the normalized copy.
 */
const HEADER_RE = new RegExp(
  '^(' +
    'may\\s+contain(?:s)?(?:\\s+traces?\\s+of(?:\\s+the\\s+following)?)?' +
    '|traces?\\s+of' +
    '|trazas?\\s+de' +
    '|tracce?\\s+di' +
    '|tra[cç]os?\\s+de' +
    '|traces?\\s+de' +
    '|spuren\\s+von' +
    '|contiene\\s+tracce\\s+di' +
    '|peut\\s+contenir(?:\\s+des)?(?:\\s+traces?\\s+de)?' +
    '|puede\\s+contener(?:\\s+trazas?\\s+de)?' +
    '|kann\\s+enthalten(?:\\s+spuren\\s+von)?' +
    '|pu[o\u00F2\u00F8]\\s+contenere(?:\\s+tracce?\\s+di)?' +
    '|pode\\s+conter(?:\\s+tra[cç]os?\\s+de)?' +
    '|kan\\s+bevatten(?:\\s+sporen)?' +
    '|mo[zż]e\\s+zawiera[cć]' +
    '|allergen\\s+note' +
    '|allergen\\s+information' +
    '|allergens?' +
    '|contains?' +
    '|contient' +
    '|contiene' +
    '|cont[e\u00E9]m' +
    '|cont[e\u00E9]n' +
    '|bevat' +
    '|zawiera' +
    '|(?:re)?(?:manufactured|packed|produced|processed|made)\\s+in' +
    '|shared\\s+(?:line|equipment|facility|facilities)' +
  ')\\b',
  'i'
);

/**
 * Keywords that end the ingredient and allergen sections entirely. Note that
 * "ingredients" is deliberately absent: it introduces the list, so treating it
 * as a terminator would truncate a label that opens with "Ingredients:".
 */
const TERMINATOR_RE = new RegExp(
  '^(' +
    'nutritional(?:\\s+(?:information|values|per))?' +
    '|nutrition(?:\\s+(?:information|values|per))?' +
    '|net\\s+(?:qty|quantity|wt|weight|content)' +
    '|storage' +
    '|store\\s+(?:in|at)' +
    '|best\\s+before' +
    '|use\\s+by' +
    '|expiry' +
    '|shelf\\s+life' +
    '|fssai' +
    '|lic(?:ence|ense)' +
    '|(?:re)?manufacturer' +
    '|marketed\\s+by' +
    '|manufactured\\s+by' +
    '|packed\\s+by' +
    '|imported\\s+by' +
    '|distributed\\s+by' +
    '|customer\\s+care' +
    '|for\\s+queries' +
    '|email' +
    '|website' +
    '|www' +
    '|registered\\s+office' +
  ')\\b',
  'i'
);

type SectionKind = 'declared' | 'trace' | 'default';

interface Match {
  /** Index of the keyword itself. */
  start: number;
  /** Index where the section content begins (after any colon). */
  contentStart: number;
  kind: SectionKind;
}

function classify(keyword: string): SectionKind {
  const k = keyword.toLowerCase().replace(/\s+/g, ' ');
  if (/^allergen (note|information)$/.test(k)) return 'default';
  if (
    /^(may contain|traces? of|shared )/.test(k) ||
    /(re)?(manufactured|packed|produced|processed|made) in$/.test(k)
  ) {
    return 'trace';
  }
  // Every non-English trace phrase, and the facility warnings.
  if (
    /^(trazas? de|tracce? di|tra[cç]os? de|traces? de|spuren von|peut contenir|puede contener|kann enthalten|pu[o\u00F2\u00F8] contenere|pode conter|kan bevatten|mo[z\u017C]e zawiera[c\u0107])/.test(
      k
    )
  ) {
    return 'trace';
  }
  return 'declared';
}

/**
 * Section boundaries. Newlines count alongside the punctuation separators: OCR
 * returns the ingredient list as separate lines, so an allergen header almost
 * always starts a line. Without this the scanner never noticed
 * "CONTAINS: WHEAT, MILK" sitting on its own line and discarded the
 * declaration as an ingredient.
 */
function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const c = text[i - 1];
  return c === '.' || c === ';' || c === ',' || c === '\n' || c === '\r';
}

const BOUNDARY_CHARS = ['.', ';', ',', '\n', '\r'];

/**
 * The character that separates what precedes `at` from `at`, ignoring spaces and
 * tabs.
 *
 * `matchAt` is called with the position of the whitespace before a candidate
 * keyword, so `text[at - 1]` is that space. Skipping back over it is what makes
 * "salt. Contains wheat" and "salt\nCONTAINS: wheat" both count as sentence
 * starts.
 */
function boundaryCharBefore(text: string, at: number): string {
  let k = at - 1;
  while (k >= 0 && (text[k] === ' ' || text[k] === '\t')) k--;
  return k >= 0 ? text[k] : '';
}

function skipSpace(text: string, i: number): number {
  let j = i;
  while (j < text.length && /\s/.test(text[j])) j++;
  return j;
}

/**
 * Matches `regex` at the segment boundary at index `at`.
 *
 * A candidate only counts when it is followed by a colon, or when the boundary
 * that introduced it is a sentence boundary (start of text, "." or ";"). That is
 * what keeps prose like "wheat flour (contains gluten)" from being read as an
 * allergen declaration, and "salt contains sodium" from truncating the list.
 *
 * A short leading word is tolerated only when a colon follows the keyword, so a
 * typo such as "MAYA CONTAINS: nuts" still reads as a declaration instead of
 * being swallowed as an ingredient.
 */
function matchAt(text: string, at: number, regex: RegExp, forceSentence: boolean): Match | null {
  const i = skipSpace(text, at);
  if (i >= text.length) return null;

  const rest = text.slice(i);
  const prev = boundaryCharBefore(text, at);
  const sentenceBoundary = forceSentence || prev === '' || BOUNDARY_CHARS.includes(prev);

  let start = i;
  let m = regex.exec(rest);
  if (!m) {
    const lead = /^[A-Za-z]{1,12}[ ]?/.exec(rest);
    if (!lead) return null;
    m = regex.exec(rest.slice(lead[0].length));
    if (!m) return null;
    start = i + lead[0].length;
  }

  const colon = /^\s*[:\-]/.exec(text.slice(start + m[0].length));
  if (!colon && !sentenceBoundary) return null;

  return {
    start,
    contentStart: start + m[0].length + (colon ? colon[0].length : 0),
    kind: classify(m[1]),
  };
}

/** Scans left to right, returning every accepted keyword match. */
function scanAll(text: string, regex: RegExp): Match[] {
  const found: Match[] = [];
  let i = 0;
  // The position right after a header always starts a new section body, so it
  // behaves as a sentence boundary even though a space precedes it. Without this
  // the nested header in "Allergen Note: Contains wheat" is never detected.
  let atSectionStart = true;

  while (i <= text.length) {
    if (atSectionStart || isBoundary(text, i)) {
      const m = matchAt(text, i, regex, atSectionStart);
      if (m) {
        found.push(m);
        i = Math.max(m.contentStart, i + 1);
        atSectionStart = i === m.contentStart;
        continue;
      }
    }
    atSectionStart = false;
    i++;
  }
  return found;
}

/** Cuts the text at the first regulatory/contact keyword. */
function trimAtTerminator(text: string): string {
  const first = scanAll(text, TERMINATOR_RE)[0];
  return first ? text.slice(0, first.start) : text;
}

/**
 * Splits on list separators only. Parentheses are left intact so a qualified
 * ingredient such as "Soy Lecithin (E322)" or "Wheat Flour (contains gluten)"
 * survives as one item rather than being cut at the closing bracket.
 *
 * Line breaks count as separators because OCR emits one ingredient per line.
 */
function splitItems(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map(s => s.trim().replace(/^[.;\s]+|[.,\s]+$/g, ''))
    .filter(s => s.length > 0);
}

/** Allergen lists also split on "&", "+", "and" and "or" ("Oats And Soy"). */
function splitAllergenItems(text: string): string[] {
  return text
    .split(/\s*(?:,|;|\n|&|\+|\band\b|\bor\b)\s*/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Splits composite labels on their sub-list names, e.g. Indian multi-component
 * packs: "Noodles: wheat flour, salt. Masala: salt, spices" yields the noodles
 * and masala items, with the "Noodles"/"Masala" labels dropped rather than
 * treated as ingredients.
 *
 * Unlike the previous implementation this keeps every ingredient instead of
 * discarding anything that is not preceded by a colon, and it refuses to eat a
 * header or terminator keyword as if it were a sub-list name.
 */
function splitSubLists(text: string): string[] {
  const labels: { start: number; end: number }[] = [];
  const LABEL_RE = /^([A-Za-z][A-Za-z0-9 '&()\-]{0,24}?)\s*:\s*/;

  for (let i = 0; i <= text.length; i++) {
    if (!isBoundary(text, i)) continue;
    const m = LABEL_RE.exec(text.slice(skipSpace(text, i)));
    if (!m) continue;
    if (HEADER_RE.test(m[1]) || TERMINATOR_RE.test(m[1])) continue;
    labels.push({ start: skipSpace(text, i), end: skipSpace(text, i) + m[0].length });
  }

  if (labels.length === 0) return splitItems(text);

  const chunks: string[] = [];
  if (labels[0].start > 0) chunks.push(text.slice(0, labels[0].start));
  for (let i = 0; i < labels.length; i++) {
    const end = i + 1 < labels.length ? labels[i + 1].start : text.length;
    chunks.push(text.slice(labels[i].end, end));
  }

  return chunks
    .flatMap(splitItems)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalize(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function parseIngredients(rawText: string): ParsedIngredients {
  if (!rawText || !rawText.trim()) {
    return { ingredients: [], declaredAllergens: [], mayContain: [] };
  }

  // Horizontal whitespace is collapsed, but newlines are preserved. OCR returns
  // an ingredient list as separate lines, and an allergen header almost always
  // starts a line; flattening it to spaces destroyed that signal and made
  // "CONTAINS: WHEAT, MILK" invisible to the header scanner.
  const cleaned = stripEmphasis(rawText).replace(/[^\S\n]+/g, ' ').trim();
  const headers = scanAll(cleaned, HEADER_RE);

  const declaredAllergens: string[] = [];
  const mayContain: string[] = [];

  const mainText = headers.length > 0 ? cleaned.slice(0, headers[0].start) : cleaned;
  const ingredients = splitSubLists(trimAtTerminator(mainText));

  for (let i = 0; i < headers.length; i++) {
    const end = i + 1 < headers.length ? headers[i + 1].start : cleaned.length;
    const body = trimAtTerminator(cleaned.slice(headers[i].contentStart, end));
    if (!body.trim()) continue;

    // "Allergen Note" is only a container: a nested header has already set the
    // kind, otherwise the note is itself a declaration.
    const kind: SectionKind = headers[i].kind === 'default' ? 'declared' : headers[i].kind;
    const items = splitAllergenItems(body);
    if (kind === 'trace') mayContain.push(...items);
    else declaredAllergens.push(...items);
  }

  return {
    ingredients,
    declaredAllergens: dedupe(declaredAllergens),
    mayContain: dedupe(mayContain),
  };
}

export { normalize };
