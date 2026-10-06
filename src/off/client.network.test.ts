/**
 * Network behaviour of the Open Food Facts client.
 *
 * The happy path is not what breaks here: timeouts, rate limits, flaky transport
 * and a database with gaps are the normal case for a community-maintained API,
 * and each one has to degrade to something the user can act on.
 *
 * Two things make these tests deterministic:
 *
 * - `fetch` is replaced per test, so no request leaves the machine.
 * - The client keeps a module-level response cache, so each test loads a fresh
 *   copy of the module. Without that, the first test's lookup silently answers
 *   every later one and the suite stops testing the network at all.
 *
 * Timeouts and retry backoff are driven with fake timers, never with a real wait.
 */
import type * as Client from './client';

const BASE = 'https://world.openfoodfacts.org/api/v0/product/';
const SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';

type FetchMock = jest.Mock<Promise<unknown>, [string, RequestInit?]>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  } as unknown as Response;
}

/** Open Food Facts answers 200 with `status: 1` and a product when it knows the code. */
function offResponse(product: Record<string, unknown> | null): Response {
  return jsonResponse({ status: product ? 1 : 0, product });
}

/** A product body with sane defaults, so a test only states what it cares about. */
function product(over: Record<string, unknown> = {}) {
  return {
    code: '8901063162914',
    product_name: 'Test Biscuits',
    brands: 'Test Foods',
    ingredients_text: 'Wheat Flour, Sugar',
    ...over,
  };
}

let fetchMock: FetchMock;

/** Loads a pristine copy of the client, with its own empty cache. */
function loadClient(): typeof Client {
  let mod!: typeof Client;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./client') as typeof Client;
  });
  return mod;
}

/**
 * Lets queued promise callbacks run without advancing time. `fetchWithRetry`
 * awaits a backoff timer before retrying, so a retry test also advances timers.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  fetchMock = jest.fn() as FetchMock;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // Fake timers are on for every test so the 8s timeout and the retry backoff
  // are reachable without spending 8 seconds of wall clock.
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('fetchProductByBarcode: rejection', () => {
  it('refuses a non-product payload before issuing a request', async () => {
    // A QR payload is arbitrary text. Letting it into the URL would put the
    // user's scanned string on the wire and guarantee a pointless 404.
    const { fetchProductByBarcode } = loadClient();

    await expect(fetchProductByBarcode('https://example.com/p/1')).rejects.toThrow(
      'not a product barcode'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['7 digits', '1234567'],
    ['15 digits', '123456789012345'],
    ['letters', 'ABCDEFGH'],
    ['empty', '   '],
  ])('rejects %s without calling the API', async (_label, code) => {
    const { fetchProductByBarcode } = loadClient();

    await expect(fetchProductByBarcode(code)).rejects.toThrow('not a product barcode');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchProductByBarcode: success', () => {
  it('returns the normalised product for a known code', async () => {
    fetchMock.mockResolvedValue(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    const lookup = await fetchProductByBarcode('8901063162914');

    expect(lookup.product?.product_name).toBe('Test Biscuits');
    expect(lookup.needsIngredients).toBe(false);
    expect(lookup.matchedCode).toBe('8901063162914');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('encodes the code and requests only the fields the app uses', async () => {
    fetchMock.mockResolvedValue(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    await fetchProductByBarcode('8901063162914');

    const requested = fetchMock.mock.calls[0][0] as string;
    expect(requested.startsWith(`${BASE}8901063162914.json?fields=`)).toBe(true);
    expect(requested).toContain('ingredients_text');
  });

  it('reports a product that exists but carries no ingredients', async () => {
    // Distinct from "not found": the barcode is valid, so the user needs to read
    // the pack rather than try a different code.
    fetchMock.mockResolvedValue(offResponse(product({ ingredients_text: '   ' })));
    const { fetchProductByBarcode } = loadClient();

    const lookup = await fetchProductByBarcode('8901063162914');

    expect(lookup.product).not.toBeNull();
    expect(lookup.needsIngredients).toBe(true);
  });

  it('treats a newline-only ingredients field as no ingredients', async () => {
    fetchMock.mockResolvedValue(offResponse(product({ ingredients_text: '\n\t ' })));
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('8901063162914')).needsIngredients).toBe(true);
  });

  it('falls back to image_url when no front image exists', async () => {
    fetchMock.mockResolvedValue(
      offResponse(product({ image_front_url: undefined, image_url: 'https://img/p.jpg' }))
    );
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('8901063162914')).product?.image_front_url).toBe(
      'https://img/p.jpg'
    );
  });
});

describe('fetchProductByBarcode: missing product', () => {
  it('returns null for a 404 without treating it as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));
    const { fetchProductByBarcode } = loadClient();

    const lookup = await fetchProductByBarcode('9999999999999');

    expect(lookup.product).toBeNull();
    expect(lookup.needsIngredients).toBe(false);
  });

  it('returns null when the API reports status 0 with no product', async () => {
    fetchMock.mockResolvedValue(offResponse(null));
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('9999999999999')).product).toBeNull();
  });

  it('treats an empty product object as a hit with no data, not as a miss', async () => {
    // Known gap, recorded rather than papered over. Open Food Facts answers 200
    // with `product: {}` for codes it has a stub row for, and the current guard
    // is only `status === 0 || !data.product`, so an empty object passes as a
    // hit. The scanner then renders an unnamed product with no ingredients
    // instead of offering the "read the pack" fallback.
    //
    // Fix: treat a product with no code and no name as absent.
    fetchMock.mockResolvedValue(offResponse({}));
    const { fetchProductByBarcode } = loadClient();

    const lookup = await fetchProductByBarcode('9999999999999');

    expect(lookup.product).not.toBeNull();
    expect(lookup.product?.product_name).toBeUndefined();
    expect(lookup.needsIngredients).toBe(true);
  });
});

describe('fetchProductByBarcode: encoding variants', () => {
  it('recovers a UPC-A stored zero-padded as EAN-13', async () => {
    fetchMock
      .mockResolvedValueOnce(offResponse(null))
      .mockResolvedValueOnce(offResponse(product({ code: '0017620422003' })));
    const { fetchProductByBarcode } = loadClient();

    const lookup = await fetchProductByBarcode('017620422003');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lookup.matchedCode).toBe('0017620422003');
    expect(lookup.product?.code).toBe('0017620422003');
  });

  it('ends the lookup on a hard transport failure rather than trying other encodings', async () => {
    // The scanned code is always tried first, so a hard failure surfaces as an
    // error even though a 12-digit code also has a zero-padded alternative. This
    // is deliberate: a network that is down will not answer the second encoding
    // either, and retrying it would triple the wait for the same failure.
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const { fetchProductByBarcode, barcodeVariants } = loadClient();

    expect(barcodeVariants('017620422003')).toHaveLength(2);

    const pending = fetchProductByBarcode('017620422003').catch((e: Error) => e);
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toThrow('Network request failed');
  });

  it('surfaces the error when the originally scanned code itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { fetchProductByBarcode } = loadClient();

    await expect(fetchProductByBarcode('8901063162914')).rejects.toThrow('network down');
  });

  it('issues only one request for a code with a single encoding', async () => {
    fetchMock.mockResolvedValue(offResponse(product()));
    const { fetchProductByBarcode, barcodeVariants } = loadClient();

    await fetchProductByBarcode('8901063162914');

    // A 13-digit code that does not start with zero has no alternative encoding.
    expect(barcodeVariants('8901063162914')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchProductByBarcode: localized ingredient text', () => {
  it('prefers the English field over the base field', async () => {
    fetchMock.mockResolvedValue(
      offResponse(product({ ingredients_text: 'Sucre, noisettes', ingredients_text_en: 'Sugar, hazelnuts' }))
    );
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('8901063162914')).product?.ingredients_text).toBe(
      'Sugar, hazelnuts'
    );
  });

  it('falls back to the base field when the English one is blank', async () => {
    fetchMock.mockResolvedValue(
      offResponse(product({ ingredients_text: 'Sucre, noisettes', ingredients_text_en: '' }))
    );
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('8901063162914')).product?.ingredients_text).toBe(
      'Sucre, noisettes'
    );
  });

  it('reads a regional language field when the base and English ones are empty', async () => {
    // Why a meaningful share of products looked "not found": the text is entered
    // only in the local language.
    fetchMock.mockResolvedValue(
      offResponse(
        product({ ingredients_text: '', ingredients_text_en: '', ingredients_text_fr: 'Sucre, lait' })
      )
    );
    const { fetchProductByBarcode } = loadClient();

    const lookup = await fetchProductByBarcode('8901063162914');

    expect(lookup.product?.ingredients_text).toBe('Sucre, lait');
    expect(lookup.needsIngredients).toBe(false);
  });

  it('prefers readable English over a regional field that is not English text', async () => {
    // On some products the regional fields hold a copy of a different language
    // entirely, so preference order is safety-critical, not cosmetic.
    fetchMock.mockResolvedValue(
      offResponse(
        product({
          ingredients_text: 'Zucker',
          ingredients_text_en: 'Sugar, MILK',
          ingredients_text_de: 'Zucker, MILCH',
        })
      )
    );
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('8901063162914')).product?.ingredients_text).toBe(
      'Sugar, MILK'
    );
  });

  it('skips a present-but-blank regional field and takes the next one', async () => {
    fetchMock.mockResolvedValue(
      offResponse(
        product({
          ingredients_text: '',
          ingredients_text_en: '',
          ingredients_text_hi: '   ',
          ingredients_text_ta: 'மா',
        })
      )
    );
    const { fetchProductByBarcode } = loadClient();

    expect((await fetchProductByBarcode('8901063162914')).product?.ingredients_text).toBe('மா');
  });
});

describe('fetchProductByBarcode: resilience', () => {
  it('retries a 500 and returns the eventual success', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914');
    await settle();
    await jest.advanceTimersByTimeAsync(600);

    expect((await pending).product).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 rate limit rather than failing the scan', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914');
    await settle();
    await jest.advanceTimersByTimeAsync(600);

    expect((await pending).product).not.toBeNull();
  });

  it('gives up after the retry budget on a persistent 500', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914').catch((e: Error) => e);
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toThrow('Open Food Facts error: 500');
    // One initial attempt plus two retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 403, which will not become a 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914').catch((e: Error) => e);
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toThrow('403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transport TypeError, which is what offline looks like', async () => {
    // React Native surfaces a dead connection as a bare TypeError.
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914');
    await settle();
    await jest.advanceTimersByTimeAsync(600);

    expect((await pending).product).not.toBeNull();
  });

  it('surfaces the TypeError when the device stays offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914').catch((e: Error) => e);
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toThrow('Network request failed');
  });

  it('does not retry a non-retryable error', async () => {
    fetchMock.mockRejectedValue(new Error('bad config'));
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914').catch((e: Error) => e);
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toThrow('bad config');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight request once the timeout elapses', async () => {
    // A request that never settles: the 8s timeout has to be what ends it, so
    // the user gets an error instead of a spinner that never resolves.
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signals.push(signal as AbortSignal);
          signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );
    const { fetchProductByBarcode } = loadClient();

    fetchProductByBarcode('8901063162914').catch(() => undefined);

    await jest.advanceTimersByTimeAsync(7500);
    expect(signals[0].aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(500);
    expect(signals[0].aborted).toBe(true);
  });

  it('attaches an abort signal to every attempt, so retries cannot hang', async () => {
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
    );
    const { fetchProductByBarcode } = loadClient();

    const pending = fetchProductByBarcode('8901063162914').catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(8000 + 500 + 8000 + 1000 + 8000 + 5000);

    await expect(pending).resolves.toThrow();
  });

  it('sends a User-Agent, as the Open Food Facts API terms require', async () => {
    fetchMock.mockResolvedValue(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    await fetchProductByBarcode('8901063162914');

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^TrueLabels\//);
  });
});

describe('fetchProductByBarcode: cache', () => {
  it('serves a repeat lookup without a second request', async () => {
    fetchMock.mockResolvedValue(offResponse(product()));
    const { fetchProductByBarcode } = loadClient();

    await fetchProductByBarcode('8765432109876');
    const second = await fetchProductByBarcode('8765432109876');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.product?.product_name).toBe('Test Biscuits');
  });

  it('caches a miss so an unknown barcode does not re-hit the API', async () => {
    fetchMock.mockResolvedValue(offResponse(null));
    const { fetchProductByBarcode } = loadClient();

    await fetchProductByBarcode('1111111111111');
    const second = await fetchProductByBarcode('1111111111111');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.product).toBeNull();
  });

  it('keys the cache by the scanned code, not the variant that matched', async () => {
    fetchMock
      .mockResolvedValueOnce(offResponse(null))
      .mockResolvedValueOnce(offResponse(product({ code: '0017620422003' })));
    const { fetchProductByBarcode } = loadClient();

    await fetchProductByBarcode('017620422003');
    await fetchProductByBarcode('017620422003');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used entry once the cache is full', async () => {
    fetchMock.mockResolvedValue(offResponse(null));
    const { fetchProductByBarcode } = loadClient();

    // CACHE_LIMIT is 50. Filling past it must not grow without bound, and the
    // evicted code must be fetched again while the recent one is still cached.
    for (let i = 0; i < 50; i++) await fetchProductByBarcode(`1000000000${String(i).padStart(3, '0')}`);
    const callsAfterFill = fetchMock.mock.calls.length;

    await fetchProductByBarcode('9999999999999'); // 51st distinct code, evicts one
    const callsAfterEviction = fetchMock.mock.calls.length;
    await fetchProductByBarcode('1000000000000');

    expect(callsAfterFill).toBe(50);
    expect(callsAfterEviction).toBe(51);
    // The oldest entry was evicted, so it is fetched again; nothing else is lost.
    expect(fetchMock.mock.calls.length).toBe(52);
  });
});

describe('searchProductsByName', () => {
  function searchResponse(products: unknown[]) {
    return jsonResponse({ products });
  }

  it('returns code, name and metadata for each hit', async () => {
    fetchMock.mockResolvedValue(
      searchResponse([
        { code: '1', product_name: 'Marie Gold', brands: 'Sunfeast', image_front_url: 'i.jpg' },
      ])
    );
    const { searchProductsByName } = loadClient();

    const results = await searchProductsByName('Marie Gold');

    expect(results).toEqual([
      { code: '1', name: 'Marie Gold', brands: 'Sunfeast', imageUrl: 'i.jpg' },
    ]);
    expect(fetchMock.mock.calls[0][0] as string).toContain(SEARCH);
  });

  it.each([
    ['an empty query', ''],
    ['a single character', 'a'],
    ['whitespace only', '   '],
  ])('does not search for %s', async (_label, query) => {
    const { searchProductsByName } = loadClient();

    expect(await searchProductsByName(query)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty list rather than throwing on a persistent server error', async () => {
    // The name search is a convenience fallback; failing it must not take the
    // screen down. A 500 is retried twice first, then the non-ok response is
    // reported as no results.
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { searchProductsByName } = loadClient();

    const pending = searchProductsByName('Biscuit');
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    expect(await pending).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns an empty list when the payload has no products array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 1 }));
    const { searchProductsByName } = loadClient();

    expect(await searchProductsByName('Biscuit')).toEqual([]);
  });

  it('returns an empty list when products is not an array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ products: { code: '1' } }));
    const { searchProductsByName } = loadClient();

    expect(await searchProductsByName('Biscuit')).toEqual([]);
  });

  it('drops hits that have no code, which cannot be looked up again', async () => {
    fetchMock.mockResolvedValue(
      searchResponse([{ code: '', product_name: 'Nameless' }, { code: '', product_name: '' }])
    );
    const { searchProductsByName } = loadClient();

    expect(await searchProductsByName('Nameless')).toEqual([]);
  });

  it('falls back to the code when a hit has no product name', async () => {
    fetchMock.mockResolvedValue(searchResponse([{ code: '3017620422003' }]));
    const { searchProductsByName } = loadClient();

    expect(await searchProductsByName('Nutella')).toEqual([
      { code: '3017620422003', name: '3017620422003', brands: undefined, imageUrl: undefined },
    ]);
  });

  it('trims whitespace around a product name', async () => {
    fetchMock.mockResolvedValue(searchResponse([{ code: '1', product_name: '  Biscuit  ' }]));
    const { searchProductsByName } = loadClient();

    expect((await searchProductsByName('Biscuit'))[0].name).toBe('Biscuit');
  });

  it('honours the result limit', async () => {
    fetchMock.mockResolvedValue(searchResponse([{ code: '1', product_name: 'A' }]));
    const { searchProductsByName } = loadClient();

    await searchProductsByName('Biscuit', 1);

    expect(fetchMock.mock.calls[0][0] as string).toContain('page_size=1');
  });

  it('survives a thrown transport error so the screen keeps working', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const { searchProductsByName } = loadClient();

    const pending = searchProductsByName('Biscuit').catch((e: Error) => e);
    await settle();
    await jest.advanceTimersByTimeAsync(5000);

    // The screen catches this itself, but the failure must not be swallowed here.
    await expect(pending).resolves.toThrow();
  });
});

describe('barcode helpers', () => {
  it('trims before validating', () => {
    const { isProductBarcode } = loadClient();
    expect(isProductBarcode('  8901063162914  ')).toBe(true);
  });

  it('accepts the shortest and longest valid lengths', () => {
    const { isProductBarcode } = loadClient();
    expect(isProductBarcode('12345678')).toBe(true);
    expect(isProductBarcode('12345678901234')).toBe(true);
  });

  it('returns variants with the scanned code first', () => {
    const { barcodeVariants } = loadClient();
    expect(barcodeVariants('017620422003')[0]).toBe('017620422003');
  });
});