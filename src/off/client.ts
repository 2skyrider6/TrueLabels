import { OffProduct, OffApiResponse } from './types';
import { apiBaseUrl, searchUrl } from '@/config/env';

const USER_AGENT = 'TrueLabels/1.0 (contact@truelabels.in)';

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_LIMIT = 50;

/**
 * Open Food Facts holds ingredient text in a base field plus per-language
 * variants. The base field is usually populated, but a meaningful share of
 * products carry text only in a regional language, which is why the base field
 * alone left many products looking like "not found".
 */
const BASE_FIELDS = [
  'code',
  'product_name',
  'brands',
  'quantity',
  'ingredients_text',
  'allergens_text',
  'ingredients_analysis_tags',
  'image_front_url',
  'image_url',
  'countries_tags',
  'categories_tags',
];

const LANGUAGE_CODES = [
  'en',
  'hi',
  'ta',
  'te',
  'kn',
  'ml',
  'bn',
  'mr',
  'gu',
  'pa',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'sv',
  'da',
  'fi',
  'pl',
  'ru',
  'uk',
  'tr',
  'ar',
  'zh',
  'ja',
  'ko',
  'th',
  'vi',
  'id',
  'ms',
];

/**
 * English first, then the base field, then every regional language.
 *
 * English is preferred because it is the only field verified to be a genuine
 * translation. This matters: on some products the regional fields hold a copy of
 * a completely different language, so preferring them over a readable base value
 * would produce a worse analysis.
 */
function ingredientFieldChain(prefix: 'ingredients_text' | 'allergens_text'): string[] {
  return [`${prefix}_en`, `${prefix}`, ...LANGUAGE_CODES.filter(c => c !== 'en').map(c => `${prefix}_${c}`)];
}

const FIELDS = [
  ...new Set([...BASE_FIELDS, ...ingredientFieldChain('ingredients_text'), ...ingredientFieldChain('allergens_text')]),
].join(',');

/**
 * Open Food Facts only indexes GTIN/EAN/UPC codes. A scanned QR or DataMatrix
 * payload is arbitrary text, so it is rejected before it reaches the URL.
 */
export function isProductBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code.trim());
}

/**
 * Alternative encodings of the same GTIN.
 *
 * The same physical barcode is stored inconsistently: UPC-A as 12 digits in one
 * product and zero-padded to EAN-13 in another, ITF-14 as 14. Trying the
 * equivalents recovers a slice of products that a single exact lookup misses.
 */
export function barcodeVariants(code: string): string[] {
  const trimmed = code.trim();
  const variants = new Set<string>([trimmed]);

  const digits = trimmed.replace(/\D/g, '');
  if (digits !== trimmed) return Array.from(variants);

  if (digits.length === 12) {
    variants.add(`0${digits}`);
  } else if (digits.length === 13) {
    // Only strip a single leading zero; EAN-13 codes legitimately start with 0
    // and dropping more would produce an unrelated code.
    if (digits.startsWith('0')) variants.add(digits.slice(1));
  } else if (digits.length === 14) {
    variants.add(digits.slice(1));
  }

  return Array.from(variants);
}

/**
 * Picks the best available ingredient/allergen text from the localized field
 * chain, ignoring fields that are present but blank.
 */
function resolveLocalizedText(
  product: Record<string, unknown>,
  prefix: 'ingredients_text' | 'allergens_text'
): string | undefined {
  for (const field of ingredientFieldChain(prefix)) {
    const value = product[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Normalises an API product so callers always receive populated fields,
 * whichever localized variant happened to hold the text.
 */
function normalizeProduct(raw: Record<string, unknown>): OffProduct {
  const ingredients =
    resolveLocalizedText(raw, 'ingredients_text') ?? (raw.ingredients_text as string | undefined);
  const allergens =
    resolveLocalizedText(raw, 'allergens_text') ?? (raw.allergens_text as string | undefined);

  return {
    ...(raw as unknown as OffProduct),
    code: (raw.code as string) ?? '',
    product_name: (raw.product_name as string) ?? undefined,
    brands: (raw.brands as string) ?? undefined,
    // The caller reads `ingredients_text`, so the resolved value is written back
    // into it rather than forcing every call site to know about localization.
    ingredients_text: ingredients,
    allergens_text: allergens,
    image_front_url:
      (raw.image_front_url as string) ?? (raw.image_url as string) ?? undefined,
  };
}

const cache = new Map<string, OffProduct | null>();

function readCache(key: string): OffProduct | null | undefined {
  if (!cache.has(key)) return undefined;
  // Re-insert so the most recently used entry is evicted last.
  const value = cache.get(key)!;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function writeCache(key: string, value: OffProduct | null): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  // Transport failures surface as a bare TypeError in React Native.
  return error instanceof TypeError;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  backoff = 500
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, backoff * attempt));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      // Rate limiting and server errors are worth another attempt; other 4xx
      // responses are final.
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt === retries || !isRetryable(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

async function requestProduct(code: string): Promise<OffProduct | null> {
  // Encoded so an unexpected payload can never alter the request path.
  const url = `${apiBaseUrl}/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;

  const response = await fetchWithRetry(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Open Food Facts error: ${response.status} ${response.statusText}`);
  }

  const data: OffApiResponse = await response.json();
  if (data.status === 0 || !data.product) return null;

  return normalizeProduct(data.product as unknown as Record<string, unknown>);
}

/**
 * Looks up a product by barcode, retrying the equivalent UPC/EAN encodings.
 *
 * Returns null only when no encoding resolves. `needsIngredients` reports a
 * product that exists but has no readable ingredient text, which is a different
 * situation from the product being absent and is surfaced separately to the user.
 */
export interface BarcodeLookup {
  product: OffProduct | null;
  /** True when a product record was found but carries no ingredient text. */
  needsIngredients: boolean;
  matchedCode?: string;
}

export async function fetchProductByBarcode(barcode: string): Promise<BarcodeLookup> {
  const code = barcode.trim();
  if (!isProductBarcode(code)) {
    throw new Error(`"${code}" is not a product barcode.`);
  }

  const cached = readCache(code);
  if (cached !== undefined) {
    return {
      product: cached,
      needsIngredients: !cached?.ingredients_text?.trim(),
      matchedCode: cached ? code : undefined,
    };
  }

  let found: OffProduct | null = null;
  let matchedCode: string | undefined;

  for (const variant of barcodeVariants(code)) {
    try {
      const result = await requestProduct(variant);
      if (result) {
        found = result;
        matchedCode = variant;
        break;
      }
    } catch (error) {
      // A hard failure on one encoding should not abandon the remaining ones.
      if (variant === code) throw error;
    }
  }

  writeCache(code, found);

  return {
    product: found,
    needsIngredients: !!found && !found.ingredients_text?.trim(),
    matchedCode,
  };
}

export interface SearchResult {
  code: string;
  name: string;
  brands?: string;
  imageUrl?: string;
}

/**
 * Searches Open Food Facts by product or brand name.
 *
 * This is the fallback when a barcode is missing from the database: the same
 * product is often indexed under a name even when nobody has entered its GTIN,
 * so a name search recovers products that barcode lookup cannot.
 */
export async function searchProductsByName(
  query: string,
  limit = 5
): Promise<SearchResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const params = new URLSearchParams({
    search_terms: term,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(limit),
    fields: 'code,product_name,brands,image_front_url',
  });

  const response = await fetchWithRetry(`${searchUrl}?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { products?: Record<string, unknown>[] };
  if (!Array.isArray(data.products)) return [];

  return data.products
    .map(p => ({
      code: String(p.code ?? ''),
      name: String(p.product_name ?? '').trim() || String(p.code ?? ''),
      brands: (p.brands as string) ?? undefined,
      imageUrl: (p.image_front_url as string) ?? undefined,
    }))
    // A nameless, codeless entry cannot be looked up again, so it is not a
    // useful suggestion.
    .filter(p => p.code && p.name);
}