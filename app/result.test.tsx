/**
 * The result screen.
 *
 * Everything on this screen is a safety claim to the user, so the tests below
 * concentrate on claims that must never be made. The central one: a label that
 * could not be read renders as NOT READ in a neutral tone, with no counts and
 * with no reassurance, whatever verdict the engine happened to produce.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { alerts, navigatedTo, router } from '@test/fakes/environment';
import { renderWithObservedResult } from '@test/render';
import ResultScreen from './result';
import { colors } from '@/theme/tokens';
import type { Flag, ScanResult } from '@/rules/types';

const SAFE = colors.safe;
const CAUTION = colors.caution;
const DANGER = colors.danger;
const NEUTRAL = colors.neutral;

const ALLERGEN_FLAG: Flag = {
  id: 'allergen:milk',
  category: 'allergen',
  label: 'Milk',
  severity: 'unsafe',
  reason: 'Milk is declared as an ingredient on the label.',
};

const TRACE_FLAG: Flag = {
  id: 'allergen:soy',
  category: 'allergen',
  label: 'Soy',
  severity: 'caution',
  reason: 'The label warns that this product may contain soy.',
  crossContamination: true,
};

function result(over: Partial<ScanResult> = {}): ScanResult {
  return {
    source: 'label',
    rawIngredients: 'Refined Wheat Flour, Sugar, Butter 22%\nMilk Solids, Salt\nCONTAINS: WHEAT, MILK',
    parsed: {
      ingredients: ['Refined Wheat Flour', 'Sugar', 'Butter 22%', 'Milk Solids', 'Salt'],
      declaredAllergens: ['Wheat', 'Milk'],
      mayContain: [],
    },
    flags: [ALLERGEN_FLAG],
    verdict: 'unsafe',
    vegMark: 'unknown',
    offAttribution: false,
    createdAt: '2026-01-15T09:00:00.000Z',
    rulesetVersion: '2.1.0',
    insufficientData: false,
    ...over,
  };
}

/** Renders the screen with a result already in the context. */
async function renderResult(over: Partial<ScanResult> = {}) {
  return renderWithObservedResult(<ResultScreen />, result(over));
}

// ---------------------------------------------------------------------------
// No result
// ---------------------------------------------------------------------------

describe('with no result in context', () => {
  it('says there is nothing to show rather than rendering an empty verdict', async () => {
    // Reached by opening /result directly, before any scan exists.
    await renderWithObservedResult(<ResultScreen />);

    expect(screen.getByText('No scan to show')).toBeOnTheScreen();
    expect(screen.queryByText('SAFE')).toBeNull();
  });

  it('offers the scanner so the user is not stranded', async () => {
    await renderWithObservedResult(<ResultScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Open scanner' }));

    expect(navigatedTo()).toEqual(['/']);
  });
});

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

describe('verdict presentation', () => {
  it('leads with an unsafe verdict in capitals', async () => {
    await renderResult({ verdict: 'unsafe' });

    expect(screen.getByText('UNSAFE')).toBeOnTheScreen();
  });

  it('explains an unsafe verdict in allergen terms', async () => {
    await renderResult({ verdict: 'unsafe' });

    expect(
      screen.getByText('Contains flagged allergens or restricted additives')
    ).toBeOnTheScreen();
  });

  it('shows a safe verdict as a plain claim, not an exclamation', async () => {
    await renderResult({ verdict: 'safe', flags: [], parsed: { ingredients: ['Rice Flour'], declaredAllergens: [], mayContain: [] } });

    expect(screen.getByText('SAFE')).toBeOnTheScreen();
  });

  it('states what a safe verdict actually means', async () => {
    await renderResult({ verdict: 'safe', flags: [] });

    expect(
      screen.getByText('No flagged allergens or restricted additives found')
    ).toBeOnTheScreen();
  });

  it('distinguishes caution from unsafe', async () => {
    await renderResult({ verdict: 'caution', flags: [TRACE_FLAG] });

    expect(screen.getByText('CAUTION')).toBeOnTheScreen();
    expect(
      screen.getByText('Caution items or possible cross-contamination detected')
    ).toBeOnTheScreen();
  });

  
});

// ---------------------------------------------------------------------------
// An unreadable label
// ---------------------------------------------------------------------------

describe('a label that could not be read', () => {
  const unreadable = { insufficientData: true, verdict: 'safe' as const, flags: [] };

  it('never renders as SAFE, whatever the stored verdict says', async () => {
    // The stored verdict for an unreadable photo defaults to `safe`. Presenting
    // it verbatim would be the single worst failure this app has.
    await renderResult(unreadable);

    expect(screen.queryByText('SAFE')).toBeNull();
    expect(screen.getByText('NOT READ')).toBeOnTheScreen();
  });

  it('gives a neutral reason rather than a verdict message', async () => {
    await renderResult(unreadable);

    expect(
      screen.getByText('No ingredient text could be read from this label')
    ).toBeOnTheScreen();
  });

  it('withholds the declared, flag and may-contain counts', async () => {
    // Counts on an unreadable label would imply the label was analysed.
    await renderResult(unreadable);

    expect(screen.queryByText('Declared')).toBeNull();
    expect(screen.queryByText('Flags')).toBeNull();
    expect(screen.queryByText('May contain')).toBeNull();
  });

  it('tells the user to treat the result as unknown', async () => {
    await renderResult(unreadable);

    expect(screen.getByText('Treat this result as unknown')).toBeOnTheScreen();
  });

  it('points at the two things that can fix it', async () => {
    await renderResult(unreadable);

    expect(screen.getByText(/Retake the photo with the ingredient list filling the frame/)).toBeTruthy();
    expect(screen.getByText(/use Paste Ingredients to type it in/)).toBeTruthy();
  });

  it('does not claim nothing was found', async () => {
    await renderResult(unreadable);

    expect(screen.queryByText('No triggering ingredients found')).toBeNull();
    expect(screen.getByText('Nothing to analyse — the label was not read')).toBeOnTheScreen();
  });

  it('still shows the allergens that were partly read', async () => {
    // Everything read is still evidence; nothing read is not a licence to hide
    // what was.
    await renderResult({ ...unreadable, parsed: { ingredients: [], declaredAllergens: ['Milk'], mayContain: [] } });

    expect(screen.getByText('Milk')).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// Declared allergens
// ---------------------------------------------------------------------------

describe('declared allergens', () => {
  it('lists each one as a chip', async () => {
    await renderResult();

    // Both the declaration chips and the flag rows carry the allergen name, so
    // the assertion is on the section rather than on a unique text node.
    const section = screen.getByText('Allergens Declared');
    expect(section).toBeOnTheScreen();
    expect(screen.getAllByText('Wheat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Milk').length).toBeGreaterThan(0);
  });

  it('says the manufacturer declares them present', async () => {
    await renderResult();

    expect(
      screen.getByText('The manufacturer declares these as present in the product.')
    ).toBeOnTheScreen();
  });

  it('omits the section entirely when nothing is declared', async () => {
    await renderResult({ parsed: { ingredients: ['Rice Flour'], declaredAllergens: [], mayContain: [] } });

    expect(screen.queryByText('Allergens Declared')).toBeNull();
  });

  it('counts them in the hero, so the number is visible without scrolling', async () => {
    await renderResult();

    // Two declared allergens, one flag and no traces, so the hero shows 2 / 1 / 0.
    expect(screen.getByText('Declared')).toBeOnTheScreen();
    expect(heroStat('Declared')).toBe('2');
    expect(heroStat('Flags')).toBe('1');
    expect(heroStat('May contain')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

describe('flags', () => {
  it('names each trigger', async () => {
    await renderResult();

    // The declaration chip carries the same word, so the trigger is located by
    // its accessible row name.
    expect(screen.getByRole('button', { name: /^Milk, unsafe\./ })).toBeOnTheScreen();
  });

  it('keeps the reason collapsed until asked, so the summary stays readable', async () => {
    await renderResult();

    expect(screen.queryByText(ALLERGEN_FLAG.reason)).toBeNull();
  });

  it('expands the reason on demand', async () => {
    await renderResult();

    await fireEvent.press(
      screen.getByRole('button', { name: /^Milk, unsafe\. Show details$/ })
    );

    expect(screen.getByText(ALLERGEN_FLAG.reason)).toBeOnTheScreen();
  });

  it('collapses again on a second press', async () => {
    await renderResult();

    const row = () =>
      screen.getByRole('button', { name: /^Milk, unsafe\. Show details$/ });
    await fireEvent.press(row());
    await fireEvent.press(
      screen.getByRole('button', { name: /^Milk, unsafe\. Hide details$/ })
    );

    expect(screen.queryByText(ALLERGEN_FLAG.reason)).toBeNull();
  });

  it('reports expansion state to assistive technology', async () => {
    await renderResult();

    const row = screen.getByRole('button', { name: /^Milk, unsafe\. Show details$/ });
    expect(row.props.accessibilityState).toMatchObject({ expanded: false });

    await fireEvent.press(row);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Milk, unsafe\. Hide details$/ }).props
          .accessibilityState
      ).toMatchObject({ expanded: true })
    );
  });

  it('tags a cross-contamination flag separately from a declaration', async () => {
    // The difference matters to an allergic user, so it cannot be left to the
    // severity colour alone. Both the row and its badge carry the wording.
    await renderResult({ flags: [TRACE_FLAG], verdict: 'caution' });

    expect(screen.getAllByText('Cross-contamination').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Soy, caution\./ })).toBeOnTheScreen();
  });

  it('says so when nothing triggered', async () => {
    await renderResult({ flags: [] });

    expect(screen.getByText('No triggering ingredients found')).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

describe('may contain', () => {
  it('lists traces with the wording the label uses', async () => {
    await renderResult({ parsed: { ingredients: [], declaredAllergens: [], mayContain: ['Soy'] } });

    expect(screen.getByText('Soy')).toBeOnTheScreen();
    expect(
      screen.getByText('The label warns these may be present through shared equipment.')
    ).toBeOnTheScreen();
  });

  it('states plainly when there are none', async () => {
    await renderResult();

    expect(screen.getByText('No “may contain” items detected')).toBeOnTheScreen();
  });

  it('keeps traces out of the declared count', async () => {
    await renderResult({
      parsed: { ingredients: [], declaredAllergens: ['Milk'], mayContain: ['Soy', 'Nuts'] },
    });

    // One declared, two traces. Conflating them would overstate the label.
    expect(heroStat('Declared')).toBe('1');
    expect(heroStat('May contain')).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// Veg mark and raw text
// ---------------------------------------------------------------------------

describe('veg mark', () => {
  it('says the mark is not analysed, rather than showing an empty result', async () => {
    await renderResult();

    expect(screen.getByText(/^Not analysed\./)).toBeTruthy();
  });

  it('explains why nothing is inferred from the photo', async () => {
    await renderResult();

    expect(screen.getByText(/nothing is inferred from the photo/)).toBeTruthy();
  });
});

describe('raw ingredient text', () => {
  it('shows the text verbatim, so the verdict can be checked', async () => {
    await renderResult();

    expect(screen.getByText(/Refined Wheat Flour, Sugar, Butter 22%/)).toBeTruthy();
  });

  it('states the ruleset version the verdict came from', async () => {
    await renderResult();

    expect(screen.getByText('Ruleset 2.1.0')).toBeOnTheScreen();
  });

  it('says so when there is no text at all', async () => {
    await renderResult({ rawIngredients: '' });

    expect(screen.getByText('No ingredients text provided')).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// Product identity
// ---------------------------------------------------------------------------

describe('product identity', () => {
  it('is omitted when the scan carries no identity at all', async () => {
    // A typed scan has no product, so the card would be three empty rows.
    await renderResult({
      source: 'manual',
      productName: undefined,
      barcode: undefined,
      imageUrl: undefined,
    });

    expect(screen.queryByText('Unnamed product')).toBeNull();
  });

  it('falls back to Unnamed product when there is a photo but no name', async () => {
    await renderResult({ source: 'label', productName: undefined, imageUrl: 'file:///documents/scans/a.jpg' });

    expect(screen.getByText('Unnamed product')).toBeOnTheScreen();
  });

  it('shows the brands line when the source knew them', async () => {
    await renderResult({ productName: 'Creamy Biscuits', brands: 'Some Brand' });

    expect(screen.getByText('Some Brand')).toBeOnTheScreen();
  });

  it('labels the source, so a typed entry is not passed off as a scan', async () => {
    await renderResult({ source: 'manual', productName: 'Pasta' });

    expect(screen.getByText('Typed')).toBeOnTheScreen();
  });

  it('labels a label photo distinctly from a barcode', async () => {
    await renderResult({ source: 'label', productName: 'Biscuits' });

    expect(screen.getByText('Label photo')).toBeOnTheScreen();
  });
});

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

describe('Open Food Facts attribution', () => {
  it('is shown for a barcode lookup', async () => {
    await renderResult({
      source: 'barcode',
      barcode: '8901234567890',
      offAttribution: true,
      offUrl: 'https://world.openfoodfacts.org/product/8901234567890',
    });

    expect(
      screen.getByRole('link', { name: 'View this product on openfoodfacts.org' })
    ).toBeOnTheScreen();
  });

  it('is absent for a photo, because no external data was used', async () => {
    await renderResult({ source: 'label', offAttribution: false });

    expect(screen.queryByText('Product data from Open Food Facts')).toBeNull();
  });

  it('is absent when a barcode scan carries no attribution', async () => {
    // A barcode lookup that fell back to a typed list must not credit OFF for
    // the analysis.
    await renderResult({ source: 'barcode', barcode: '8901234567890', offAttribution: false });

    expect(screen.queryByText('Product data from Open Food Facts')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Disclaimer and navigation
// ---------------------------------------------------------------------------

describe('disclaimer', () => {
  it('states the result is informational, not medical advice', async () => {
    await renderResult();

    expect(screen.getByText(/not medical advice/)).toBeTruthy();
  });

  it('tells the user to read the full label', async () => {
    await renderResult();

    expect(screen.getByText(/consult a healthcare professional/)).toBeTruthy();
  });
});

describe('navigation actions', () => {
  it('replaces the screen when scanning another item, so Back cannot return to a stale verdict', async () => {
    await renderResult();

    await fireEvent.press(screen.getByRole('button', { name: 'Scan another item' }));

    expect(navigatedTo()).toEqual(['/']);
    expect(router.calls[0].method).toBe('replace');
  });

  it('pushes history, so Back returns to this verdict', async () => {
    await renderResult();

    await fireEvent.press(screen.getByRole('button', { name: 'View history' }));

    expect(navigatedTo()).toEqual(['/history']);
    expect(router.calls[0].method).toBe('push');
  });
});

// ---------------------------------------------------------------------------
// Guard against a green screen
// ---------------------------------------------------------------------------

describe('tone of the verdict block', () => {
  it('uses the neutral palette for an unreadable label, not the safe one', async () => {
    const palette = await heroPalette({ insufficientData: true, verdict: 'safe', flags: [] });

    expect(palette).toContain(NEUTRAL);
    expect(palette).not.toContain(SAFE);
  });

  it('uses the danger palette for an unsafe verdict', async () => {
    const palette = await heroPalette({ verdict: 'unsafe' });

    expect(palette).toContain(DANGER);
    expect(palette).not.toContain(SAFE);
  });

  it('uses the safe palette for a clean, readable label', async () => {
    const palette = await heroPalette({
      verdict: 'safe',
      flags: [],
      parsed: { ingredients: ['Rice Flour'], declaredAllergens: [], mayContain: [] },
    });

    expect(palette).toContain(SAFE);
  });

  it('raises no alert on the result screen, which has nothing to recover from', async () => {
    await renderResult({ verdict: 'safe', flags: [] });

    expect(alerts).toHaveLength(0);
  });
});

/**
 * The tone colours the verdict hero actually painted.
 *
 * The verdict colour is the app's most consequential signal for a user who cannot
 * read the verdict word, so it is asserted directly rather than inferred from the
 * text beside it. Finding the hero by walking for a node bordered in a tone colour
 * avoids depending on how many `View`s happen to sit between the title and it.
 */
async function heroPalette(over: Partial<ScanResult>): Promise<string> {
  await renderResult(over);

  const tones: string[] = [SAFE, CAUTION, DANGER, NEUTRAL];
  const seen: string[] = [];

  walk(screen.toJSON() as unknown, node => {
    const style = flattenStyle((node as { props?: { style?: unknown } }).props?.style);
    for (const key of ['backgroundColor', 'borderColor'] as const) {
      const value = style[key];
      if (typeof value === 'string' && tones.includes(value)) seen.push(value);
    }
  });

  return seen.join(' ');
}

/**
 * A hero statistic's value, read from the value/label pair.
 *
 * The values are bare numbers repeated across the hero, so they cannot be matched
 * as text. Reading the sibling of the label avoids depending on the order the
 * three stats happen to be laid out in.
 */
function heroStat(label: string): string {
  const siblings = screen.getByText(label).parent?.children ?? [];
  const value = (siblings[0] as { props?: { children?: unknown } } | undefined)?.props?.children;
  expect(['string', 'number']).toContain(typeof value);
  return String(value);
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, entry) => ({ ...acc, ...flattenStyle(entry) }),
      {}
    );
  }
  return (style as Record<string, unknown>) ?? {};
}

function walk(node: unknown, visit: (node: unknown) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const children = (node as { children?: unknown[] }).children;
  if (Array.isArray(children)) children.forEach(child => walk(child, visit));
}