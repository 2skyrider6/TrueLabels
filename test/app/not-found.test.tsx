/**
 * The recovery screen for a barcode Open Food Facts cannot answer.
 *
 * Two branches reach it, and they say different things: an unknown barcode, and a
 * known product with no ingredient list. The rest of the screen is recovery —
 * read the pack, type it, or search by name — and the tests here care most about
 * the one path that could still produce a wrong result: opening a name-search hit
 * whose ingredient text turns out to be empty.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  appHistoryModule,
  navigatedTo,
  resetRouter,
  router,
} from '@test/fakes/environment';
import { lastSeenResult, renderWithObservedResult } from '@test/render';
import NotFoundScreen from '../../app/not-found';

type OffModule = typeof import('@/off/client');

let off: OffModule;

jest.mock('@/off/client', () => {
  const actual = jest.requireActual('@/off/client') as typeof import('@/off/client');
  return {
    __esModule: true,
    isProductBarcode: actual.isProductBarcode,
    barcodeVariants: actual.barcodeVariants,
    fetchProductByBarcode: jest.fn(),
    searchProductsByName: jest.fn(),
  };
});

function searchHit(over: Record<string, unknown> = {}) {
  return {
    code: '8901234567891',
    name: 'Marie Gold Biscuit',
    brands: 'Some Brand',
    imageUrl: 'https://images.openfoodfacts.org/hit.jpg',
    ...over,
  };
}

function product(over: Record<string, unknown> = {}) {
  return {
    code: '8901234567891',
    product_name: 'Marie Gold Biscuit',
    brands: 'Some Brand',
    ingredients_text: 'Refined Wheat Flour, Sugar\nCONTAINS: WHEAT',
    image_front_url: 'https://images.openfoodfacts.org/hit.jpg',
    ...over,
  };
}

const search = () => off.searchProductsByName as jest.Mock;
const lookup = () => off.fetchProductByBarcode as jest.Mock;

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  off = require('@/off/client') as OffModule;
  search().mockReset();
  lookup().mockReset();
});

async function renderNotFound(params: Record<string, string> = {}) {
  resetRouter(params);
  return renderWithObservedResult(<NotFoundScreen />);
}

/** Types a term and runs the search. */
async function runSearch(term: string) {
  await fireEvent.changeText(screen.getByLabelText('Product name to search for'), term);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
}

// ---------------------------------------------------------------------------
// The two failure reasons
// ---------------------------------------------------------------------------

describe('an unknown barcode', () => {
  it('says the code was not found, quoting it', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    expect(screen.getByText('Barcode not recognised')).toBeOnTheScreen();
    expect(screen.getByText(/8901234567890 is not in the Open Food Facts database/)).toBeTruthy();
  });

  it('explains that the database is community-maintained, so this is not a fault', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    expect(screen.getByText(/community-maintained/)).toBeTruthy();
  });
});

describe('a known product with no ingredient list', () => {
  it('says the problem is the ingredients, not the code', async () => {
    await renderNotFound({
      barcode: '8901234567890',
      productName: 'Some Snack',
      reason: 'ingredients',
    });

    expect(screen.getByText('No ingredient list')).toBeOnTheScreen();
    expect(screen.queryByText('Barcode not recognised')).toBeNull();
  });

  it('names the product, so the user knows which pack is meant', async () => {
    await renderNotFound({
      barcode: '8901234567890',
      productName: 'Some Snack',
      reason: 'ingredients',
    });

    expect(
      screen.getByText(/Some Snack is in the Open Food Facts database/)
    ).toBeTruthy();
  });

  it('copes with no product name, which a miss does not supply', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'ingredients' });

    expect(screen.getByText(/nobody has entered its ingredients yet/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Recovery routes
// ---------------------------------------------------------------------------

describe('recovery routes', () => {
  it('offers the label photo first, since reading the pack always works', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    const actions = screen.getAllByRole('button').map(node => node.props.accessibilityLabel);
    expect(actions.indexOf('Scan the ingredient label')).toBeLessThan(
      actions.indexOf('Type the ingredients')
    );
  });

  it('routes to the label photo', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await fireEvent.press(screen.getByRole('button', { name: 'Scan the ingredient label' }));

    expect(navigatedTo()).toEqual(['/label-scan']);
  });

  it('routes to the typed route', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await fireEvent.press(screen.getByRole('button', { name: 'Type the ingredients' }));

    expect(navigatedTo()).toEqual(['/paste']);
  });

  it('says which routes work offline', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    expect(screen.getByText(/Scanning or typing the ingredient label is analysed on this device/)).toBeTruthy();
  });

  it('goes back rather than forward, so the scanner is not stacked up', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await fireEvent.press(screen.getByRole('button', { name: 'Back to scanner' }));

    expect(router.backCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Name search
// ---------------------------------------------------------------------------

describe('searching by name', () => {
  it('refuses a term too short to be meaningful', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await fireEvent.changeText(screen.getByLabelText('Product name to search for'), 'a');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    );
  });

  it('pre-fills the query with the product name when the code did resolve', async () => {
    // The name is already known, so making the user retype it would be wasteful.
    await renderNotFound({
      barcode: '8901234567890',
      productName: 'Some Snack',
      reason: 'ingredients',
    });

    expect(screen.getByLabelText('Product name to search for').props.value).toBe('Some Snack');
  });

  it('runs the search and lists the hits', async () => {
    search().mockResolvedValue([searchHit()]);
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await runSearch('Marie');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Marie Gold Biscuit' })).toBeOnTheScreen()
    );
    expect(search()).toHaveBeenCalledWith('Marie');
  });

  it('warns that a name match may be a different formulation', async () => {
    search().mockResolvedValue([searchHit()]);
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await runSearch('Marie');

    expect(screen.getByText(/Ingredients may differ from your pack/)).toBeTruthy();
  });

  it('points at the reliable routes when nothing matches', async () => {
    search().mockResolvedValue([]);
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await runSearch('Nonexistent Product');

    await waitFor(() =>
      expect(screen.getByText(/Scanning or typing the label is the reliable route/)).toBeTruthy()
    );
  });

  it('says nothing was found rather than showing an error, when the search fails', async () => {
    // A failed search and an empty one lead to the same advice, so an alert here
    // would interrupt without telling the user anything new.
    search().mockRejectedValue(new Error('offline'));
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    await runSearch('Marie');

    await waitFor(() =>
      expect(screen.getByText(/Nothing found for/)).toBeTruthy()
    );
  });

  it('shows nothing before a search has been run', async () => {
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });

    expect(screen.queryByText(/Nothing found for/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Opening a search hit
// ---------------------------------------------------------------------------

describe('opening a name-search hit', () => {
  it('analyses it and opens the result', async () => {
    search().mockResolvedValue([searchHit()]);
    lookup().mockResolvedValue({ product: product(), needsIngredients: false });
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });
    await runSearch('Marie');

    await fireEvent.press(screen.getByRole('button', { name: 'Marie Gold Biscuit' }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
    expect(appHistoryModule().countScans()).toBe(1);
  });

  it('records it as a barcode scan, not as a manual entry', async () => {
    search().mockResolvedValue([searchHit()]);
    lookup().mockResolvedValue({ product: product(), needsIngredients: false });
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });
    await runSearch('Marie');

    await fireEvent.press(screen.getByRole('button', { name: 'Marie Gold Biscuit' }));

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(1));
    expect(appHistoryModule().getScansPage()[0].source).toBe('barcode');
  });

  it('reports a declared allergen as unsafe', async () => {
    search().mockResolvedValue([searchHit()]);
    lookup().mockResolvedValue({ product: product(), needsIngredients: false });
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });
    await runSearch('Marie');

    await fireEvent.press(screen.getByRole('button', { name: 'Marie Gold Biscuit' }));

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(1));
    expect(appHistoryModule().getScansPage()[0].verdict).toBe('unsafe');
  });

  it('falls back to the label when the hit turns out to have no ingredients', async () => {
    // The index carries the name but not the ingredients, so analysing it would
    // produce a clean result from nothing.
    search().mockResolvedValue([searchHit()]);
    lookup().mockResolvedValue({
      product: product({ ingredients_text: '   ' }),
      needsIngredients: true,
    });
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });
    await runSearch('Marie');

    await fireEvent.press(screen.getByRole('button', { name: 'Marie Gold Biscuit' }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/label-scan']));
    expect(appHistoryModule().countScans()).toBe(0);
    expect(lastSeenResult()?.result).toBeNull();
  });

  it('falls back to the label when the lookup fails outright', async () => {
    search().mockResolvedValue([searchHit()]);
    lookup().mockRejectedValue(new Error('offline'));
    await renderNotFound({ barcode: '8901234567890', reason: 'barcode' });
    await runSearch('Marie');

    await fireEvent.press(screen.getByRole('button', { name: 'Marie Gold Biscuit' }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/label-scan']));
  });

  it('prefers the searched hit over the pre-filled product name', async () => {
    // The pre-filled name belongs to the code that failed, not to the hit opened.
    search().mockResolvedValue([searchHit()]);
    lookup().mockResolvedValue({
      product: product({ product_name: 'Actual Name From Pack' }),
      needsIngredients: false,
    });
    await renderNotFound({
      barcode: '8901234567890',
      productName: 'Original Name',
      reason: 'ingredients',
    });
    await runSearch('Marie');

    await fireEvent.press(screen.getByRole('button', { name: 'Marie Gold Biscuit' }));

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(1));
    expect(appHistoryModule().getScansPage()[0].productName).toBe('Actual Name From Pack');
  });
});
