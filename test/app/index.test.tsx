/**
 * The barcode screen.
 *
 * Two things are worth testing here beyond navigation. First, what happens when a
 * product cannot be resolved: a barcode miss and a product with no ingredient text
 * are different problems, and both have to leave the camera rather than leaving the
 * user staring at a spinner. Second, the guards around scanning, because a barcode
 * held in frame fires continuously and an unguarded handler would fire a network
 * request per frame.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { camera, emitBarcode, markCameraReady, resetCamera } from '@test/fakes/camera';
import { alerts, appHistoryModule, navigatedTo, pressAlertButton, router } from '@test/fakes/environment';
import { lastSeenResult, renderWithObservedResult } from '@test/render';
import HomeScreen from '../../app/index';

type OffModule = typeof import('@/off/client');

let off: OffModule;

/** A product as Open Food Facts would return it. */
function product(over: Record<string, unknown> = {}) {
  return {
    code: '8901234567890',
    product_name: 'Creamy Biscuits',
    brands: 'Some Brand',
    ingredients_text: 'Refined Wheat Flour, Sugar, Butter\nCONTAINS: WHEAT, MILK',
    image_front_url: 'https://images.openfoodfacts.org/front.jpg',
    ...over,
  };
}

jest.mock('@/off/client', () => {
  const actual = jest.requireActual('@/off/client') as typeof import('@/off/client');
  return {
    __esModule: true,
    isProductBarcode: actual.isProductBarcode,
    barcodeVariants: actual.barcodeVariants,
    searchProductsByName: jest.fn(),
    fetchProductByBarcode: jest.fn(),
  };
});

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  off = require('@/off/client') as OffModule;
  (off.fetchProductByBarcode as jest.Mock).mockReset();
});

/** Makes every lookup resolve to the given product, or to nothing. */
function lookupReturns(
  result: { product?: Record<string, unknown> | null; needsIngredients?: boolean } | Error
) {
  const mocked = off.fetchProductByBarcode as jest.MockedFunction<
    OffModule['fetchProductByBarcode']
  >;
  if (result instanceof Error) {
    mocked.mockRejectedValue(result);
    return;
  }
  mocked.mockResolvedValue({
    product: (result.product ?? null) as Awaited<
      ReturnType<OffModule['fetchProductByBarcode']>
    >['product'],
    needsIngredients: result.needsIngredients ?? false,
  });
}

/**
 * Renders the home screen with the camera granted.
 *
 * Waiting on the viewfinder rather than on the render call: the permission read
 * resolves in a later tick, and until it does the screen shows only its pending
 * state, so an immediate assertion would be looking at the wrong screen.
 */
async function renderHome() {
  resetCamera({ current: 'granted' });
const result = await renderWithObservedResult(<HomeScreen />);
  await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  return result;
}

/** Brings the scanner up and fires a barcode at it. */
async function scan(code: string) {
  await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  await act(async () => {
    markCameraReady();
  });
  await act(async () => {
    emitBarcode(code);
  });
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

describe('camera permission', () => {
  it('does not prompt on mount, so a refused camera is not re-asked every launch', async () => {
    // Home reads the current status but leaves the prompt to the Retry button.
    // Asking on mount would mean the user cannot get to the typed routes
    // without first answering a camera prompt they already refused.
    resetCamera({ current: 'undetermined', nextRequest: 'granted' });
    await renderWithObservedResult(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
    expect(camera.requestCount).toBe(0);
  });

  it('shows the viewfinder once permission is granted', async () => {
    await renderHome();

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  });

  it('explains the refusal instead of showing an inert camera', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithObservedResult(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('offers a retry, because the user may have changed the setting', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithObservedResult(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());

    resetCamera({ current: 'denied', nextRequest: 'granted' });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry permission' }));

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  });

  it('still offers typed entry when the camera is refused', async () => {
    // A user with no camera permission must not lose the app.
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithObservedResult(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());

    expect(screen.getByRole('button', { name: 'Paste ingredients text' })).toBeEnabled();
  });

  it('blocks the label route when the camera is refused', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithObservedResult(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());

    // It photographs the ingredient panel, so it needs the camera too.
    expect(
      screen.getByRole('button', { name: 'Scan a food label using the camera and OCR' })
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Successful lookup
// ---------------------------------------------------------------------------

describe('a barcode that resolves', () => {
  beforeEach(() => {
    lookupReturns({ product: product() });
  });

  it('replaces the screen with the result', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
    expect(router.calls[0].method).toBe('replace');
  });

  it('records the scan, attributed to Open Food Facts', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(1));
    const [stored] = appHistoryModule().getScansPage();
    expect(stored.barcode).toBe('8901234567890');
    expect(stored.source).toBe('barcode');
    expect(stored.productName).toBe('Creamy Biscuits');
  });

  it('reports a declared allergen as unsafe', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(1));
    expect(appHistoryModule().getScansPage()[0].verdict).toBe('unsafe');
  });

  it('does not store the remote product image, which the device cannot display later', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(1));
    expect(appHistoryModule().getScansPage()[0].imageUri).toBeUndefined();
  });

  it('shows the last code so the user can tell what was read', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() =>
      expect(screen.getByText('Last scanned 8901234567890')).toBeOnTheScreen()
    );
  });
});

// ---------------------------------------------------------------------------
// Unresolvable barcodes
// ---------------------------------------------------------------------------

describe('a barcode Open Food Facts does not know', () => {
  it('leaves the camera and explains, rather than looping on the same miss', async () => {
    lookupReturns({ product: null });
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(router.calls).toHaveLength(1));
    expect(router.calls[0]).toMatchObject({ method: 'push', pathname: '/not-found' });
    expect(router.calls[0].params).toMatchObject({
      barcode: '8901234567890',
      reason: 'barcode',
    });
  });

  it('distinguishes a missing product from a missing ingredient list', async () => {
    // The two need different actions: hunt for the code, or photograph the pack.
    lookupReturns({ product: null });
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(router.calls.at(-1)?.params?.reason).toBe('barcode'));
  });

  it('records nothing, so a miss does not pollute history', async () => {
    lookupReturns({ product: null });
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(router.calls).toHaveLength(1));
    expect(appHistoryModule().countScans()).toBe(0);
  });
});

describe('a product with no ingredient text', () => {
  beforeEach(() => {
    lookupReturns({ product: product({ ingredients_text: '' }), needsIngredients: true });
  });

  it('reports the missing-ingredients reason, not a missing barcode', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() =>
      expect(router.calls.at(-1)?.params?.reason).toBe('ingredients')
    );
  });

  it('passes the product name along, so the screen can name the product', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() =>
      expect(router.calls.at(-1)?.params?.productName).toBe('Creamy Biscuits')
    );
  });

  it('never analyses an empty ingredient list into a clean result', async () => {
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(appHistoryModule().countScans()).toBe(0));
    expect(lastSeenResult()?.result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scanning guards
// ---------------------------------------------------------------------------

describe('scanning guards', () => {
  beforeEach(() => {
    lookupReturns({ product: product() });
  });

  it('ignores a scan before the camera reports ready', async () => {
    // `onCameraReady` can lag the first frames, and a scan then would be handled
    // while the view is still initialising.
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    await act(async () => {
      emitBarcode('8901234567890');
    });

    expect(off.fetchProductByBarcode).not.toHaveBeenCalled();
  });

  it('looks up a code only once, however many times it is scanned', async () => {
    // A barcode held in frame fires continuously; without the guard this is a
    // network request per frame.
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    await act(async () => {
      markCameraReady();
    });

    await act(async () => {
      emitBarcode('8901234567890');
      emitBarcode('8901234567890');
      emitBarcode('8901234567890');
    });

    await waitFor(() => expect(off.fetchProductByBarcode).toHaveBeenCalledTimes(1));
  });

  it('rejects a QR payload, which is arbitrary text rather than a product code', async () => {
    await renderHome();

    await scan('https://example.com/product/12345');

    expect(off.fetchProductByBarcode).not.toHaveBeenCalled();
    expect(alerts.at(-1)?.title).toBe('Not a product barcode');
  });

  it('alerts once for a repeatedly scanned invalid code', async () => {
    await renderHome();

    await scan('not-a-barcode');
    await act(async () => {
      emitBarcode('not-a-barcode');
      emitBarcode('not-a-barcode');
    });

    await waitFor(() =>
      expect(alerts.filter(a => a.title === 'Not a product barcode')).toHaveLength(1)
    );
  });

  it('points at the label route from the rejection', async () => {
    await renderHome();

    await scan('not-a-barcode');

    expect(alerts.at(-1)?.message).toMatch(/use Scan Label to read the ingredients/);
  });

  it('ignores a blank scan', async () => {
    await renderHome();

    await scan('   ');

    expect(off.fetchProductByBarcode).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(0);
  });

  it('allows a different code to be scanned afterwards', async () => {
    lookupReturns({ product: null });
    await renderHome();

    await scan('8901234567890');
    await waitFor(() => expect(router.calls).toHaveLength(1));

    lookupReturns({ product: product({ code: '8901234567891' }) });
    await act(async () => {
      emitBarcode('8901234567891');
    });

    await waitFor(() => expect(off.fetchProductByBarcode).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------------------
// Lookup failure
// ---------------------------------------------------------------------------

describe('a failed lookup', () => {
  it('alerts instead of navigating away', async () => {
    lookupReturns(new Error('network unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(alerts.at(-1)?.title).toBe('Error'));
    expect(navigatedTo()).toEqual([]);
  });

  it('records nothing', async () => {
    lookupReturns(new Error('network unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderHome();

    await scan('8901234567890');

    await waitFor(() => expect(alerts).toHaveLength(1));
    expect(appHistoryModule().countScans()).toBe(0);
  });

  it('lets the same code be retried once the alert is dismissed', async () => {
    // Without this the camera is permanently dead after one network blip, since
    // the same code keeps firing.
    lookupReturns(new Error('network unreachable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderHome();

    await scan('8901234567890');
    await waitFor(() => expect(alerts).toHaveLength(1));

    lookupReturns({ product: product() });
    await pressAlertButton('OK');
    await act(async () => {
      emitBarcode('8901234567890');
    });

    await waitFor(() => expect(off.fetchProductByBarcode).toHaveBeenCalledTimes(2));
    // Settled before the test ends: a lookup still in flight would resolve after
    // cleanup and unmount the root the next test renders into.
    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
  });
});

// ---------------------------------------------------------------------------
// Manual entry
// ---------------------------------------------------------------------------

describe('typing a barcode', () => {
  beforeEach(() => {
    lookupReturns({ product: product() });
  });

  it('keeps Look up disabled until the entry could be a barcode', async () => {
    await renderHome();

    expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Barcode number'), '8901234567890');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Look up' })).toBeEnabled()
    );
  });

  it('stays disabled for a code that is too short to be one', async () => {
    await renderHome();

    await fireEvent.changeText(screen.getByLabelText('Barcode number'), '1234567');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled()
    );
  });

  it('looks up a valid typed code', async () => {
    await renderHome();

    await fireEvent.changeText(screen.getByLabelText('Barcode number'), '8901234567890');
    await fireEvent.press(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(navigatedTo()).toEqual(['/result']));
  });

  it('rejects an entry that is not numeric, rather than guessing an encoding', async () => {
    await renderHome();

    await fireEvent.changeText(screen.getByLabelText('Barcode number'), '89012345678a');

    // The entry cannot be a barcode, so Look up never enables and the malformed
    // value is never handed to the client.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled()
    );
    expect(off.fetchProductByBarcode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('navigation', () => {
  it('opens history from the header', async () => {
    await renderHome();

    await fireEvent.press(screen.getByRole('button', { name: 'Open scan history' }));

    expect(navigatedTo()).toEqual(['/history']);
  });

  it('offers the label-photo route as an alternative to a barcode', async () => {
    await renderHome();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Scan a food label using the camera and OCR' })
    );

    expect(navigatedTo()).toEqual(['/label-scan']);
  });

  it('offers the typed route for a label a camera cannot read', async () => {
    await renderHome();

    await fireEvent.press(screen.getByRole('button', { name: 'Paste ingredients text' }));

    expect(navigatedTo()).toEqual(['/paste']);
  });
});

// ---------------------------------------------------------------------------
// Torch
// ---------------------------------------------------------------------------

describe('torch', () => {
  it('is unavailable until the camera is ready', async () => {
    await renderHome();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Toggle torch' })).toBeDisabled()
    );
  });

  it('toggles once the camera is ready, and reports its state', async () => {
    await renderHome();
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    await act(async () => {
      markCameraReady();
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Toggle torch' })).toBeEnabled()
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Toggle torch' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Toggle torch' }).props.accessibilityState).toMatchObject(
        { selected: true }
      )
    );
  });
});
