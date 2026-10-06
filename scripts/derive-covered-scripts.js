/**
 * Derives the set of scripts the bundled ruleset can actually read, from the
 * ruleset data itself.
 *
 * Counting every term is not good enough. `גלוטמט` (gluten) is the only Hebrew
 * term present and it belongs to a caution rule, so treating Hebrew as covered
 * would let an allergen-bearing Hebrew label through as SAFE. Coverage therefore
 * counts only allergen terms, which is the thing the app promises to read.
 */
const fs = require('fs');
const path = require('path');

const RULESET = path.join(__dirname, '..', 'src', 'rules', 'ruleset.json');

const RANGES = [
  ['hiragana', 0x3040, 0x309f], ['katakana', 0x30a0, 0x30ff],
  ['han', 0x4e00, 0x9fff], ['han', 0x3400, 0x4dbf],
  ['hangul', 0xac00, 0xd7af], ['hangul', 0x1100, 0x11ff],
  ['cyrillic', 0x0400, 0x04ff], ['greek', 0x0370, 0x03ff],
  ['arabic', 0x0600, 0x06ff], ['arabic', 0x0750, 0x077f],
  ['hebrew', 0x0590, 0x05ff], ['devanagari', 0x0900, 0x097f],
  ['bengali', 0x0980, 0x09ff], ['gurmukhi', 0x0a00, 0x0a7f],
  ['gujarati', 0x0a80, 0x0aff], ['tamil', 0x0b80, 0x0bff],
  ['telugu', 0x0c00, 0x0c7f], ['kannada', 0x0c80, 0x0cff],
  ['malayalam', 0x0d00, 0x0d7f], ['sinhala', 0x0d80, 0x0dff],
  ['thai', 0x0e00, 0x0e7f], ['lao', 0x0e80, 0x0eff],
  ['tibetan', 0x0f00, 0x0fff], ['myanmar', 0x1000, 0x109f],
  ['khmer', 0x1780, 0x17ff],
  ['latin', 0x0041, 0x007a], ['latin', 0x00c0, 0x024f], ['latin', 0x1e00, 0x1eff],
];

const IGNORABLE = /^[\s\d\p{P}\p{S}\p{C}]+$/u;

function scriptOf(text) {
  for (const char of text.trim()) {
    if (IGNORABLE.test(char)) continue;
    const code = char.codePointAt(0);
    for (const [script, start, end] of RANGES) {
      if (code >= start && code <= end) return script;
    }
  }
  return null;
}

const ruleset = JSON.parse(fs.readFileSync(RULESET, 'utf8'));

const allergen = new Map();
const caution = new Map();

for (const rule of ruleset.rules) {
  const bucket = rule.id.startsWith('allergen:') ? allergen : rule.id.startsWith('caution:') ? caution : null;
  if (!bucket) continue;
  for (const field of ['match', 'exclude']) {
    for (const term of rule[field] ?? []) {
      const script = scriptOf(term);
      if (!script) continue;
      if (!bucket.has(script)) bucket.set(script, new Set());
      bucket.get(script).add(term);
    }
  }
}

const allScripts = new Set([...allergen.keys(), ...caution.keys()]);
console.log('script        allergen-terms  caution-terms');
for (const script of [...allScripts].sort()) {
  const a = allergen.get(script)?.size ?? 0;
  const c = caution.get(script)?.size ?? 0;
  const verdict = a > 0 ? 'covered' : 'NOT COVERED';
  console.log(`  ${script.padEnd(11)} ${String(a).padStart(6)}      ${String(c).padStart(6)}   ${verdict}`);
}

const covered = [...allScripts].filter(s => (allergen.get(s)?.size ?? 0) > 0).sort();
console.log(`\nRULESET_COVERED_SCRIPTS = new Set([${covered.map(s => `'${s}'`).join(', ')}])`);

const uncovered = [...allScripts].filter(s => (allergen.get(s)?.size ?? 0) === 0);
console.log(`left uncovered: ${uncovered.length ? uncovered.join(', ') : '(none)'}`);