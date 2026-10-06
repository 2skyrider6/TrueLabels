/**
 * The history list.
 *
 * The safety-critical property here is that a scan which could not be read never
 * looks like a clean result, in the list or after it is reopened. The rest is
 * ordinary: pagination, destructive actions behind a confirmation, and deleting
 * the stored photo along with the row.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { camera, resetOcr } from '@test/fakes/camera';
import {
alerts,
  appHistoryModule,
  fakeFileSystem,
  navigatedTo,
  pressAlertButton,
} from '@test/fakes/environment';
import { lastSeenResult, renderWithObservedResult } from '@test/render';
import HistoryScreen from './history';
import type { ScanResult } from '@/rules/types';

const history = () => appHistoryModule();

function scan(over: Partial<ScanResult> = {}): ScanResult {
  return {
    source: 'manual',
    rawIngredients: 'Wheat Flour, Sugar. Contains: Milk',
    parsed: { ingredients: ['Wheat Flour', 'Sugar'], declaredAllergens: ['Milk'], mayContain: [] },
    flags: [],
    verdict: 'unsafe',
    vegMark: 'unknown',
    offAttribution: false,
createdAt: '2026-01-15T09:00:00.000Z',
    insufficientData: false,
    rulesetVersion: '2.1.0',
    ...over,
  };
}

function seed(...scans: ScanResult[]): void {
  scans.forEach(entry => history().saveScan(entry));
}

async function renderHistory() {
  return renderWithObservedResult(<HistoryScreen />);
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('empty history', () => {
  it('says so plainly', async () => {
    await renderHistory();

    expect(screen.getByText('No scans yet')).toBeOnTheScreen();
  });

  it('offers a way to start rather than leaving a dead end', async () => {
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Start scanning' }));

    expect(navigatedTo()).toEqual(['/']);
  });

  it('hides Clear all when there is nothing to clear', async () => {
    await renderHistory();

    expect(screen.queryByRole('button', { name: 'Clear all scan history' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Listing scans
// ---------------------------------------------------------------------------

describe('listing scans', () => {
  it('shows a name for a scan with no product metadata', async () => {
    seed(scan());
    await renderHistory();

    // A typed entry has no barcode and no product name from OFF, so it needs a
    // fallback rather than a blank row.
    expect(screen.getByText('Unknown product')).toBeOnTheScreen();
  });

  it('prefers the product name when the scan has one', async () => {
    seed(scan({ productName: 'Creamy Biscuits', source: 'barcode', barcode: '8901234567890' }));
    await renderHistory();

    expect(screen.getByText('Creamy Biscuits')).toBeOnTheScreen();
  });

  it('labels the source when there is no barcode', async () => {
    seed(scan({ source: 'label' }));
    await renderHistory();

    expect(screen.getByText('Label photo')).toBeOnTheScreen();
  });

  it('shows the barcode rather than the source when there is one', async () => {
    seed(scan({ source: 'barcode', barcode: '8901234567890' }));
    await renderHistory();

    expect(screen.getByText('8901234567890')).toBeOnTheScreen();
  });

  it('counts the scans it is showing', async () => {
    seed(scan(), scan());
    await renderHistory();

    expect(screen.getByText('2 scans')).toBeOnTheScreen();
  });

  it('uses the singular for a single scan', async () => {
    seed(scan());
    await renderHistory();

    expect(screen.getByText('1 scan')).toBeOnTheScreen();
  });

  it('renders an unparsable date as no date at all, rather than "Invalid Date"', async () => {
    seed(scan({ createdAt: 'not-a-date' }));
    await renderHistory();

    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unreadable scans
// ---------------------------------------------------------------------------

describe('a scan that could not be read', () => {
  it('is badged Not read instead of its verdict', async () => {
    // The stored verdict for an unreadable photo is `safe` by default, so the
    // badge has to come from `insufficientData`, not from the verdict column.
    seed(scan({ verdict: 'safe', insufficientData: true }));
    await renderHistory();

    expect(screen.getByText('Not read')).toBeOnTheScreen();
    expect(screen.queryByText('safe')).toBeNull();
  });

  it('is announced as not read, so it is not read aloud as clean', async () => {
    seed(scan({ verdict: 'safe', insufficientData: true, productName: 'Mystery Pack' }));
    await renderHistory();

    expect(
      screen.getByRole('button', { name: /^Open scan: Mystery Pack, not read,/ })
    ).toBeOnTheScreen();
  });

  it('announces a readable scan with its verdict', async () => {
    seed(scan({ verdict: 'unsafe', productName: 'Biscuits' }));
    await renderHistory();

    expect(
      screen.getByRole('button', { name: /^Open scan: Biscuits, unsafe,/ })
    ).toBeOnTheScreen();
  });

  it('reopens as unreadable rather than as a clean result', async () => {
    seed(scan({ verdict: 'safe', insufficientData: true }));
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: /^Open scan:/ }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
    expect(lastSeenResult()?.result?.insufficientData).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Opening a scan
// ---------------------------------------------------------------------------

describe('opening a stored scan', () => {
  it('pushes the result rather than replacing the list, so Back returns here', async () => {
    seed(scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: /^Open scan:/ }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
  });

  it('does not re-insert the scan, which would duplicate every entry opened', async () => {
    seed(scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: /^Open scan:/ }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
    expect(history().countScans()).toBe(1);
  });

  it('alerts when the row can no longer be read', async () => {
    seed(scan());
    await renderHistory();
    // Deletes the row behind the list's back, as a concurrent write would.
    history().deleteScan(history().getScansPage()[0].id);

    await fireEvent.press(screen.getByRole('button', { name: /^Open scan:/ }));

    await waitFor(() => expect(alerts.at(-1)?.title).toBe('Error'));
    expect(navigatedTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Deleting
// ---------------------------------------------------------------------------

describe('deleting one scan', () => {
  it('asks first, because the action cannot be undone', async () => {
    seed(scan({ productName: 'Biscuits' }));
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete scan of Biscuits' }));

    expect(alerts.at(-1)?.title).toBe('Delete scan?');
  });

  it('keeps the scan when the user cancels', async () => {
    seed(scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: /^Delete scan of/ }));
    await pressAlertButton('Cancel');

    expect(history().countScans()).toBe(1);
  });

  it('removes the row once the confirmation is accepted', async () => {
    seed(scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: /^Delete scan of/ }));
    await pressAlertButton('Delete');

    await waitFor(() => expect(history().countScans()).toBe(0));
    expect(screen.getByText('No scans yet')).toBeOnTheScreen();
  });

  it('removes the stored photo along with the row', async () => {
    // The copy lives in the documents directory, so deleting only the row would
    // leak a file for every scan the user ever removed.
    fakeFileSystem().seedFile(camera.captureUri, 'jpeg');
    seed(scan({ source: 'label', imageUrl: camera.captureUri }));
    const storedUri = history().getScansPage()[0].imageUri;
    expect(storedUri).toBeDefined();

    await renderHistory();
    await fireEvent.press(screen.getByRole('button', { name: /^Delete scan of/ }));
    await pressAlertButton('Delete');

    await waitFor(() => expect(history().countScans()).toBe(0));
    expect(fakeFileSystem().fileUris()).not.toContain(storedUri);
  });

  it('leaves the other scans alone', async () => {
    seed(scan({ productName: 'First' }), scan({ productName: 'Second' }));
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete scan of First' }));
    await pressAlertButton('Delete');

    await waitFor(() => expect(history().countScans()).toBe(1));
    expect(screen.getByText('Second')).toBeOnTheScreen();
  });

  it('falls back to the empty state when the last scan is deleted', async () => {
    seed(scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: /^Delete scan of/ }));
    await pressAlertButton('Delete');

    await waitFor(() => expect(screen.getByText('No scans yet')).toBeOnTheScreen());
  });
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

describe('clearing all history', () => {
  it('asks first, and says it cannot be undone', async () => {
    seed(scan(), scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear all scan history' }));

    expect(alerts.at(-1)?.message).toMatch(/cannot be undone/);
  });

  it('keeps everything when the user cancels', async () => {
    seed(scan(), scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear all scan history' }));
    await pressAlertButton('Cancel');

    expect(history().countScans()).toBe(2);
  });

  it('removes every row once confirmed', async () => {
    seed(scan(), scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear all scan history' }));
    await pressAlertButton('Clear All');

    await waitFor(() => expect(history().countScans()).toBe(0));
  });

  it('removes the stored photos too', async () => {
    fakeFileSystem().seedFile(camera.captureUri, 'jpeg');
    seed(scan({ source: 'label', imageUrl: camera.captureUri }));
    expect(fakeFileSystem().fileUris().some(uri => uri.includes('/documents/scans/'))).toBe(true);

    await renderHistory();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear all scan history' }));
    await pressAlertButton('Clear All');

    await waitFor(() => expect(history().countScans()).toBe(0));
    expect(fakeFileSystem().fileUris().some(uri => uri.includes('/documents/scans/'))).toBe(
      false
    );
  });

  it('hides Clear all once the list is empty, so it cannot be pressed twice', async () => {
    seed(scan());
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Clear all scan history' }));
    await pressAlertButton('Clear All');

    await waitFor(() => expect(screen.queryByText('Clear all')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('pagination', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      scan({ productName: `Pack ${i + 1}`, createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T09:00:00.000Z` })
    );

  it('loads a first page rather than the whole table', async () => {
    seed(...many(30));
    await renderHistory();

    expect(screen.getByText('25 scans')).toBeOnTheScreen();
  });

  it('offers Load more when older scans remain', async () => {
    seed(...many(30));
    await renderHistory();

    expect(screen.getByRole('button', { name: 'Load more scans' })).toBeOnTheScreen();
  });

  it('omits Load more when everything fits on one page', async () => {
    seed(...many(3));
    await renderHistory();

    expect(screen.queryByRole('button', { name: 'Load more scans' })).toBeNull();
  });

it('appends the next page rather than replacing the current one', async () => {
    seed(...many(30));
    await renderHistory();
    expect(lastSeenResult()?.scans).toHaveLength(25);

    await fireEvent.press(screen.getByRole('button', { name: 'Load more scans' }));

    await waitFor(() => expect(screen.getByText('30 scans')).toBeOnTheScreen());
    // Asserted on the context rather than the rendered rows: a FlatList only
    // mounts what fits on screen, so the oldest pack is present in the data but
    // may never be rendered.
    expect(lastSeenResult()?.scans).toHaveLength(30);
    expect(lastSeenResult()?.scans[0].productName).toBe('Pack 30');
    expect(lastSeenResult()?.scans[29].productName).toBe('Pack 1');
  });

  it('hides Load more once the last page is reached', async () => {
    seed(...many(30));
    await renderHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Load more scans' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more scans' })).toBeNull()
    );
  });
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe('ordering', () => {
  it('shows the newest scan first', async () => {
    resetOcr({ text: 'unused' });
    seed(
      scan({ productName: 'Older', createdAt: '2026-01-10T09:00:00.000Z' }),
      scan({ productName: 'Newer', createdAt: '2026-01-15T09:00:00.000Z' })
    );
    await renderHistory();

    const names = screen.getAllByText(/Older|Newer/).map(node => node.props.children);
    expect(names).toEqual(['Newer', 'Older']);
  });

  it('falls back to insertion order for scans stamped in the same instant', async () => {
    // `Date.now` is fixed in these tests, so ties are unavoidable and must not
    // shuffle the list between renders.
    seed(scan({ productName: 'First' }), scan({ productName: 'Second' }));
    await renderHistory();

    const names = screen.getAllByText(/First|Second/).map(node => node.props.children);
    expect(names).toEqual(['Second', 'First']);
  });
});

