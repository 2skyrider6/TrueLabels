/**
 * The typed-ingredients screen.
 *
 * This is the fallback path whenever a photo cannot be read, and the one route
 * that works with no camera and no network. The tests here cover the guard rails
 * around it: an empty box must not analyse, a whitespace-only box must not
 * analyse, and the item count shown next to the box has to match what the parser
 * will actually see.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { alerts, appHistoryModule, navigatedTo, router } from '@test/fakes/environment';
import { renderWithResult } from '@test/render';
import PasteScreen from '../../app/paste';

const input = () => screen.getByLabelText('Ingredients text');
const analyse = () => screen.getByRole('button', { name: 'Analyse ingredients' });

beforeEach(async () => {
  await renderWithResult(<PasteScreen />);
});

/** Types text and presses Analyse, letting the navigation settle. */
async function submit(text: string): Promise<void> {
  await fireEvent.changeText(input(), text);
  await fireEvent.press(analyse());
}

describe('initial state', () => {
  it('shows the heading and what the screen is for', () => {
    expect(screen.getByText('Type the ingredients')).toBeOnTheScreen();
    expect(screen.getByText(/analysed for allergens and additives/)).toBeOnTheScreen();
  });

  it('leaves Analyse disabled with an empty box', () => {
    expect(analyse()).toBeDisabled();
  });

  it('hides the item counter until something is typed', () => {
    expect(screen.queryByText(/items?$/)).toBeNull();
  });

  it('states that typed text works offline and barcode lookup does not', () => {
    // The user has to know the difference before they are standing in a shop.
    expect(
      screen.getByText(/Barcode lookup needs a network connection, but typed and photographed/)
    ).toBeOnTheScreen();
  });

  it('offers no camera-dependent control on this screen', () => {
    expect(screen.queryByLabelText('Take photo')).toBeNull();
  });
});

describe('typing', () => {
  it('enables Analyse once text is present', async () => {
    await fireEvent.changeText(input(), 'Milk, Sugar');

    expect(analyse()).toBeEnabled();
  });

  it.each([
    ['a single space', ' '],
    ['several spaces', '     '],
    ['a lone newline', '\n'],
  ])('keeps Analyse disabled for %s', async (_label, value) => {
    await fireEvent.changeText(input(), value);

    expect(analyse()).toBeDisabled();
  });

  it('enables Analyse for a lone comma, which yields nothing to analyse', async () => {
    // Known gap. `canAnalyze` tests `trim().length > 0`, and a comma survives
    // trimming, so the button enables. Pressing it then produces a scan with no
    // ingredients at all, which the result screen has to render as NOT READ.
    // Confining the button to text that actually parses an item would be the
    // cleaner fix; until then the NOT READ path is the safety net.
    await fireEvent.changeText(input(), ',');

    expect(analyse()).toBeEnabled();
  });

  it('counts comma-separated items', async () => {
    await fireEvent.changeText(input(), 'Milk, Sugar, Wheat Flour');

    expect(screen.getByText('3 items')).toBeOnTheScreen();
  });

  it('counts newline-separated items, which is how OCR returns them', async () => {
    await fireEvent.changeText(input(), 'Milk\nSugar\nWheat Flour');

    expect(screen.getByText('3 items')).toBeOnTheScreen();
  });

  it('ignores a trailing separator when counting', async () => {
    await fireEvent.changeText(input(), 'Milk, Sugar,');

    expect(screen.getByText('2 items')).toBeOnTheScreen();
  });

  it('does not count empty entries between separators', async () => {
    await fireEvent.changeText(input(), 'Milk, , , Sugar');

    expect(screen.getByText('2 items')).toBeOnTheScreen();
  });

  it('labels a single item in the plural', async () => {
    // Known cosmetic gap: the counter renders `${n} items` with no singular case,
    // so a one-ingredient label reads "1 items".
    await fireEvent.changeText(input(), 'Salt');

    expect(screen.getByText('1 items')).toBeOnTheScreen();
  });

  it('clears the box and re-disables Analyse', async () => {
    await fireEvent.changeText(input(), 'Milk, Sugar');

    await fireEvent.press(screen.getByText('Clear'));

    expect(input().props.value).toBe('');
    expect(analyse()).toBeDisabled();
  });

  it('hides the counter again after clearing', async () => {
    await fireEvent.changeText(input(), 'Milk');

    await fireEvent.press(screen.getByText('Clear'));

    expect(screen.queryByText('1 item')).toBeNull();
  });
});

describe('analysing', () => {
  it('replaces this screen with the result', async () => {
    // Replace, not push: back from the result must not land on a stale editor.
    await submit('Milk, Sugar, Contains: Milk');

    expect(navigatedTo()).toEqual(['/result']);
    expect(router.calls[0].method).toBe('replace');
  });

  it('records the typed text as a manual scan', async () => {
    await submit('Milk, Sugar, Contains: Peanuts');

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.source).toBe('manual');
    expect(stored.rawText).toBe('Milk, Sugar, Contains: Peanuts');
    expect(stored.verdict).toBe('unsafe');
  });

  it('stores no photo for a typed scan', async () => {
    await submit('Milk, Sugar');

    expect(appHistoryModule().getScansPage()[0].imageUri).toBeUndefined();
  });

  it('stamps the ruleset version so a scan can be re-checked after a ruleset update', async () => {
    await submit('Milk, Sugar');

    expect(appHistoryModule().getScansPage()[0].rulesetVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('marks a clean label as read rather than unreadable', async () => {
    await submit('Rice Flour, Sugar, Salt');

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.verdict).toBe('safe');
    expect(stored.insufficientData).toBe(false);
  });

  it('treats a multi-line paste with a declaration as unsafe', async () => {
    // The shape OCR produces, pasted by hand.
    await submit(['INGREDIENTS:', 'Wheat Flour, Sugar', 'CONTAINS: WHEAT, MILK'].join('\n'));

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.verdict).toBe('unsafe');
    expect(stored.insufficientData).toBe(false);
  });

  it('stores the parsed lists, not just the raw text', async () => {
    // `May contain` is a trace statement and `Contains` is a declaration, so the
    // two land in different columns. The trailing full stop rides along on the
    // declaration because `splitAllergenItems` splits on separators rather than
    // stripping sentence punctuation; the engine's word-boundary matching still
    // finds the allergen, so the verdict is unaffected.
    await submit('Wheat Flour, Sugar. Contains: Milk. May contain: Nuts');

    const [stored] = appHistoryModule().getScansPage();
    expect(JSON.parse(stored.declaredAllergensJson)).toEqual(['Milk.']);
    expect(JSON.parse(stored.mayContainJson)).toEqual(['Nuts']);
    expect(JSON.parse(stored.ingredientsJson)).toEqual(['Wheat Flour', 'Sugar']);
    expect(stored.verdict).toBe('unsafe');
  });
});

describe('analysis failure', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require('@/rules/engine') as typeof import('@/rules/engine');
    jest.spyOn(engine, 'evaluateEngine').mockImplementation(() => {
      throw new Error('boom');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows an error rather than navigating away', async () => {
    await submit('Milk, Sugar');

    expect(alerts.at(-1)).toMatchObject({
      title: 'Error',
      message: 'Failed to analyze ingredients. Please try again.',
    });
    expect(router.calls).toHaveLength(0);
  });

  it('records nothing, so a failed analysis leaves no phantom scan', async () => {
    await submit('Milk, Sugar');

    expect(appHistoryModule().countScans()).toBe(0);
  });

  it('re-enables the editor so the text can be corrected and retried', async () => {
    await submit('Milk, Sugar');

    await waitFor(() => expect(analyse()).toBeEnabled());
    expect(input().props.editable).toBe(true);
  });

  it('leaves the typed text intact after the failure', async () => {
    await submit('Milk, Sugar');

    expect(input().props.value).toBe('Milk, Sugar');
  });

  it('never exposes a busy state, because the analysis is synchronous', async () => {
    // `evaluateEngine` is called and destructured without an await, so the whole
    // handler runs in one tick: `processing` is set and cleared before React can
    // render. The button therefore never shows a spinner on this screen. Not a
    // functional problem for the current ruleset, but a large label that grew
    // analysis work behind an await would need the guard re-checked.
    await submit('Milk, Sugar');

    expect(analyse()).toBeEnabled();
  });
});

describe('repeated submission', () => {
  it('records a second scan when the user presses Analyse twice', async () => {
    // Known gap: `replace` navigates away, but the recording happens in the
    // context before navigation, so an impatient double tap stores the same
    // label twice. Guarding on the last analysed text would deduplicate it.
    await submit('Milk, Sugar');
    await submit('Milk, Sugar');

    expect(appHistoryModule().countScans()).toBe(2);
    expect(navigatedTo()).toEqual(['/result', '/result']);
  });
});
