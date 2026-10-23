/**
 * Tests for the web-search module.
 *
 * These tests mock the fetch API so no network requests are actually made.
 * The mock returns controlled Wikipedia API responses so we can verify that
 * the verdict inference logic correctly classifies ingredients.
 */

import { searchIngredient } from './web-search';

/** Mock fetch to return Wikipedia API responses. */
const mockFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

global.fetch = mockFetch;

function mockWikipediaResponse(title: string, snippet: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      query: {
        search: [
          {
            title,
            snippet,
          },
        ],
      },
    }),
  } as unknown as Response);
}

function mockWikipediaEmpty(): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      query: {
        search: [],
      },
    }),
  } as unknown as Response);
}

function mockFetchError(): void {
  mockFetch.mockRejectedValueOnce(new Error('Network error'));
}

describe('searchIngredient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('returns null when Wikipedia returns no results', async () => {
    mockWikipediaEmpty();
    const result = await searchIngredient('UnknownIngredientXyz');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetchError();
    const result = await searchIngredient('wheat');
    expect(result).toBeNull();
  });

  it('returns safe verdict for safe ingredients', async () => {
    mockWikipediaResponse(
      'Citric acid',
      'Citric acid is a weak organic acid that occurs naturally in citrus fruits. It is used as a food additive and is generally recognized as safe.'
    );
    const result = await searchIngredient('citric acid');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('safe');
    expect(result!.confidence).toBe(0.7);
  });

  it('returns unsafe verdict for unsafe ingredients', async () => {
    mockWikipediaResponse(
      'Aflatoxin',
      'Aflatoxins are toxic carcinogenic compounds produced by certain molds. They are dangerous and can cause liver cancer.'
    );
    const result = await searchIngredient('aflatoxin');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('unsafe');
    expect(result!.confidence).toBe(0.7);
  });

  it('returns caution verdict for uncertain ingredients', async () => {
    mockWikipediaResponse(
      'Aspartame',
      'Aspartame is an artificial sweetener that may cause health concerns in some studies. Its safety is debated.'
    );
    const result = await searchIngredient('aspartame');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('caution');
    expect(result!.confidence).toBe(0.7);
  });

  it('passes the ingredient text in the query', async () => {
    mockWikipediaResponse('Wheat', 'Wheat is a cereal grain.');
    await searchIngredient('wheat flour');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain('wheat+flour');
  });

  it('returns null when result has no search results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        query: {
          search: [],
        },
      }),
    } as unknown as Response);
    const result = await searchIngredient('unknownIngredientXyz123');
    expect(result).toBeNull();
  });
});
