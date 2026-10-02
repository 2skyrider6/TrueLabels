import type { RecognitionResult } from 'expo-mlkit-ocr';

let ocrModule: {
  recognizeText: (uri: string) => Promise<RecognitionResult>;
  isSupported: () => boolean;
} | null = null;
let moduleLoadError: Error | null = null;

async function loadOcrModule() {
  if (ocrModule || moduleLoadError) return;

  try {
    const mod = await import('expo-mlkit-ocr');
    ocrModule = mod;
  } catch (error) {
    moduleLoadError = error instanceof Error ? error : new Error('Failed to load OCR module');
  }
}

export async function isOcrSupported(): Promise<boolean> {
  await loadOcrModule();

  if (!ocrModule || moduleLoadError) {
    return false;
  }

  try {
    return ocrModule.isSupported();
  } catch {
    return false;
  }
}

export async function recognizeTextFromUri(uri: string): Promise<RecognitionResult> {
  await loadOcrModule();

  if (!ocrModule || moduleLoadError) {
    throw new Error(
      'OCR is not supported on this device. Please use a development build with expo-mlkit-ocr installed.'
    );
  }

  try {
    return await ocrModule.recognizeText(uri);
  } catch (error) {
    if (error instanceof Error && error.message.includes('native module')) {
      throw new Error(
        'OCR requires a development build. It does not work in Expo Go. Please run `eas build --profile development` and install on a device.'
      );
    }
    throw error;
  }
}

/**
 * Matches an ingredient header and captures anything that follows it on the same
 * line. OCR frequently merges the header and the first ingredients into one line
 * ("INGREDIENTS: Wheat Flour, Sugar"), so the remainder must be kept rather than
 * skipped.
 */
const HEADER_RE = /^\s*(?:ingredients?|composition|विवरण)\s*[:\-–—]?\s*(.*)$/i;

/**
 * Lines that end the ingredient list. "Contains" and "Allergen" are deliberately
 * absent: they introduce the allergen declaration, which is the most safety
 * critical text on the label. Truncating there discarded the declaration and let
 * products with declared allergens come back clean.
 */
const STOP_PATTERNS: RegExp[] = [
  /nutritional?\b/i,
  /^\s*nutrition\b/i,
  /fssai/i,
  /lic(?:ence|ense)\s*(?:no|number)?/i,
  /net\s*(?:qty|wt|weight|content)/i,
  /\bweight\b/i,
  /storage/i,
  /store\s+in/i,
  /best\s+before/i,
  /use\s+by/i,
  /expiry/i,
  /shelf\s+life/i,
  /manufactured\s+by/i,
  /marketed\s+by/i,
  /packed\s+by/i,
  /imported\s+by/i,
  /distributed\s+by/i,
  /customer\s+care/i,
  /for\s+(?:queries|any\s+queries)/i,
  /\bemail\b/i,
  /\bwebsite\b/i,
  /^www\./i,
  /batch\s*(?:no|number)/i,
  /registered\s+office/i,
];

/**
 * Extracts the ingredient block from raw OCR text.
 *
 * Returns only the lines between the ingredient header and the next regulatory
 * section. The allergen declaration is kept, because that is what tells the user
 * the product genuinely contains an allergen.
 */
export function extractIngredientsFromOcr(result: RecognitionResult): string {
  return extractIngredientSection(result).text;
}

/**
 * Same extraction, but also reports whether an ingredient header was actually
 * found. `foundHeader: false` means the photo probably did not contain an
 * ingredient list at all, which is the signal that no verdict can be trusted.
 */
export function extractIngredientSection(result: RecognitionResult): {
  text: string;
  foundHeader: boolean;
} {
  const text = result.text ?? '';
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const start = findIngredientStart(lines);
  if (start.index === -1) {
    // No header found. Returning the whole text keeps more allergen evidence
    // rather than silently dropping it, and the caller treats `foundHeader:
    // false` as "unreadable" so the verdict is not presented as clean.
    return { text, foundHeader: false };
  }

  const collected: string[] = [];
  if (start.firstLineContent) collected.push(start.firstLineContent);

  for (let i = start.index; i < lines.length; i++) {
    const line = lines[i];
    if (STOP_PATTERNS.some(p => p.test(line))) break;
    if (line.length > 1) collected.push(line);
  }

  return { text: collected.join('\n'), foundHeader: true };
}

function findIngredientStart(lines: string[]): { index: number; firstLineContent: string } {
  for (let i = 0; i < lines.length; i++) {
    const match = HEADER_RE.exec(lines[i]);
    if (!match) continue;

    const remainder = (match[1] ?? '').trim();
    // "INGREDIENTS: Wheat Flour, Sugar" keeps its remainder; a bare "INGREDIENTS"
    // header starts collecting on the following line.
    return remainder
      ? { index: i, firstLineContent: remainder }
      : { index: i + 1, firstLineContent: '' };
  }
  return { index: -1, firstLineContent: '' };
}
