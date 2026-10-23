/**
 * Web search fallback for ingredient label analysis.
 *
 * When the local rule engine cannot match an ingredient (no exact or fuzzy
 * match), this module queries the Wikipedia API to determine whether the
 * ingredient is safe, caution, or unsafe. Web-sourced results can upgrade or
 * downgrade the local verdict — if web says SAFE but local says UNSAFE, web
 * wins; if local says SAFE but web says UNSAFE, web wins.
 *
 * All queries go to the public Wikipedia API. No API key is required, but a
 * User-Agent header identifying the app is sent, as Wikipedia requires.
 *
 * The app is offline-first: if the network is unavailable or Wikipedia returns
 * nothing, the result is simply `null` and the local-only verdict stands.
 */

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

/**
 * Result of a Wikipedia search for an ingredient.
 */
export interface WebSearchResult {
  /** The Wikipedia article title found. */
  title: string;
  /** Snippet text from the article (HTML tags stripped). */
  snippet: string;
  /** Full URL to the Wikipedia article. */
  url: string;
  /** Whether Wikipedia had any article about this ingredient at all. */
  found: boolean;
}

/**
 * Result of looking up an ingredient on Wikipedia.
 */
export interface IngredientVerdict {
  /** The ingredient that was searched. */
  ingredient: string;
  /** The inferred verdict from Wikipedia content. */
  verdict: 'safe' | 'caution' | 'unsafe' | 'unknown';
  /** Confidence in the verdict (0-1). Lower for fuzzy/wikipedia matches. */
  confidence: number;
  /** The raw Wikipedia search result, if any. */
  result: WebSearchResult | null;
}

/** Keywords that indicate an ingredient is unsafe / an allergen. */
const UNSAFE_KEYWORDS = [
  'allergen',
  'allergic',
  'allergy',
  'toxic',
  'poison',
  'poisonous',
  'dangerous',
  'harmful',
  'adverse',
  'reaction',
  'anaphylaxis',
  'intolerance',
  'sensitivity',
  'banned',
  'prohibited',
  'restricted',
  'not permitted',
  'not allowed',
  'carcinogen',
  'mutagen',
  'teratogen',
];

/** Keywords that indicate an ingredient is safe / generally recognized as safe. */
const SAFE_KEYWORDS = [
  'generally recognized as safe',
  'gras',
  'safe for consumption',
  'safe to eat',
  'edible',
  'food additive',
  'approved',
  'permitted',
  'allowed',
  'non-toxic',
  'nontoxic',
  'hypoallergenic',
  'dermatologically tested',
];

/** Keywords that indicate caution / moderate risk. */
const CAUTION_KEYWORDS = [
  'may cause',
  'could cause',
  'linked to',
  'associated with',
  'may contain',
  'potential',
  'possible',
  'suspected',
  'controversial',
  'debated',
  'disputed',
  'limit',
  'moderation',
  'sparingly',
];

/**
 * Fetches search results from Wikipedia for a given query.
 *
 * Returns null if the network is unavailable, the request times out, or
 * Wikipedia returns no results.
 */
async function fetchWikipedia(query: string): Promise<WebSearchResult | null> {
  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('srlimit', '5');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        // Wikipedia requires a descriptive User-Agent.
        'User-Agent': 'TrueLabels/1.0.1 (https://github.com/2skyrider6/TrueLabels)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const search = data.query?.search;
    if (!search || search.length === 0) return null;

    const first = search[0];
    return {
      title: first.title,
      snippet: first.snippet?.replace(/<[^>]*>/g, '').trim() || '',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(first.title)}`,
      found: true,
    };
  } catch {
    // Network failure, timeout, or parse error — treat as not found.
    return null;
  }
}

/**
 * Infers a verdict from a Wikipedia search result by scanning the title and
 * snippet for safety-related keywords.
 *
 * Unsafe keywords take priority over safe keywords (better to err on the side
 * of caution), and caution keywords only apply when neither safe nor unsafe
 * keywords are present.
 */
function inferVerdictFromWikipedia(result: WebSearchResult): 'safe' | 'caution' | 'unsafe' | 'unknown' {
  const text = `${result.title} ${result.snippet}`.toLowerCase();

  // Check unsafe first — any unsafe keyword means we cannot present as safe.
  if (UNSAFE_KEYWORDS.some(kw => text.includes(kw))) {
    return 'unsafe';
  }

  // Check safe keywords.
  if (SAFE_KEYWORDS.some(kw => text.includes(kw))) {
    return 'safe';
  }

  // Check caution keywords.
  if (CAUTION_KEYWORDS.some(kw => text.includes(kw))) {
    return 'caution';
  }

  return 'unknown';
}

/**
 * Looks up an ingredient on Wikipedia and infers a verdict.
 *
 * Returns null if Wikipedia has no article about the ingredient or the network
 * is unavailable — in which case the local rule engine's verdict stands.
 */
export async function searchIngredient(ingredient: string): Promise<IngredientVerdict | null> {
  const result = await fetchWikipedia(ingredient);

  if (!result || !result.found) {
    return null;
  }

  const verdict = inferVerdictFromWikipedia(result);

  // Confidence for web-sourced results is deliberately lower than exact local
  // matches: Wikipedia is not a regulatory source and the match is by article
  // title, not ingredient-specific.
  const confidence = 0.7;

  return {
    ingredient,
    verdict,
    confidence,
    result,
  };
}
