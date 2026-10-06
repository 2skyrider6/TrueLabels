/**
 * The label-photo screen.
 *
 * This is the highest-risk surface in the app: a photo is read by OCR, and a bad
 * read must never come back as a clean result. The tests below drive the whole
 * flow with the camera and OCR fakes, and pin four separate guarantees:
 *
 * 1. Permission is asked for once, and denial leaves a recoverable screen.
 * 2. A photo with no located ingredient list raises an alert and is refused.
 * 3. A captured photo is copied out of the cache before it is stored.
 * 4. A typed correction can turn an unreadable read into a usable one.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { camera, ocr, resetCamera, resetOcr } from '@test/fakes/camera';
import {
  alerts,
  appHistoryModule,
  fakeFileSystem,
  navigatedTo,
} from '@test/fakes/environment';
import { renderWithResult } from '@test/render';
import LabelScanScreen from './label-scan';

const takePhoto = () => screen.getByRole('button', { name: 'Take photo' });
const readText = () => screen.getByRole('button', { name: 'Read text' });
const analyse = () => screen.getByRole('button', { name: 'Analyse ingredients' });
const editor = () => screen.getByLabelText('Recognized ingredients text');
const grant = () => screen.getByRole('button', { name: 'Grant camera access' });

/** Realistic OCR output: header, body and allergen block on separate lines. */
const READABLE_LABEL = [
  'Some Brand Creamy Biscuits',
  'Net Weight 200g',
  'INGREDIENTS:',
  'Refined Wheat Flour, Sugar, Butter 22%,',
  'Milk Solids, Salt',
  'CONTAINS: WHEAT, MILK',
  'Nutrition Information: Energy 520 kcal',
].join('\n');

/** OCR merged the header with the first ingredient line, as it often does. */
const MERGED_HEADER_LABEL = [
  'Ingredients: Wheat Flour (54%), Sugar,',
  'Milk Powder, Salt',
  'Allergen Information: Contains Wheat and Milk',
  'Best Before: See top of pack',
].join('\n');

/** A photo of the back of the pack: no ingredient list at all. */
const NOT_A_LABEL = ['Toll free 1800-123-4567', 'MRP Rs.45.00'].join('\n');

/** Renders with permission already granted, which is the common case. */
async function renderWithCamera() {
  resetCamera({ current: 'granted' });
  return renderWithResult(<LabelScanScreen />);
}

/** Presses Take photo and waits for recognition to land in the editor. */
async function capture() {
  await waitFor(() => expect(takePhoto()).toBeEnabled());
  await fireEvent.press(takePhoto());
  await waitFor(() => expect(ocr.calls).toBeGreaterThan(0));
}

// ---------------------------------------------------------------------------
// Camera permission
// ---------------------------------------------------------------------------

describe('camera permission', () => {
  it('asks for the camera on mount', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'granted' });
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(camera.requestCount).toBe(1));
    expect(camera.current).toBe('granted');
  });

  it('asks only once, because a second prompt on iOS would not appear anyway', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'granted' });
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(camera.requestCount).toBe(1));
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(ocr.calls).toBeGreaterThan(0));

    expect(camera.requestCount).toBe(1);
  });

  it('shows the viewfinder when permission was already granted', async () => {
    await renderWithCamera();

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    expect(takePhoto()).toBeOnTheScreen();
  });

  it('asks again on mount even when permission is already granted', async () => {
    // iOS resolves an already-granted permission without showing a prompt, so
    // this costs nothing. Asserted rather than left implicit because it is the
    // reason the "asking once" guarantee has to come from the mount effect alone.
    await renderWithCamera();

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    expect(camera.requestCount).toBe(1);
    expect(camera.current).toBe('granted');
  });

  it('explains the refusal when the user says no', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
    expect(
      screen.getByText(/needs the camera to photograph the ingredient panel/)
    ).toBeOnTheScreen();
  });

  it('hides the viewfinder entirely while permission is denied', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull();
  });

  it('stays denied when the user refuses the system prompt again', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied' });
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
    await fireEvent.press(grant());

    await waitFor(() => expect(camera.requestCount).toBe(2));
    expect(screen.getByText('Camera access denied')).toBeOnTheScreen();
  });

  it('treats a broken permission service as denied rather than hanging', async () => {
    resetCamera({ current: 'undetermined', nextRequest: 'denied', readThrows: true });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
  });

  it('treats a rejected permission request as denied', async () => {
    resetCamera({ current: 'undetermined', requestThrows: true });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderWithResult(<LabelScanScreen />);

    await waitFor(() => expect(screen.getByText('Camera access denied')).toBeOnTheScreen());
  });
});

// ---------------------------------------------------------------------------
// OCR availability
// ---------------------------------------------------------------------------

describe('OCR availability', () => {
  it('warns that a development build is needed when the module is missing', async () => {
    // Expo Go is the most common way someone first runs the app.
    resetOcr({ moduleMissing: true });
    await renderWithCamera();

    await waitFor(() =>
      expect(screen.getByText('Development build required')).toBeOnTheScreen()
    );
    expect(screen.getByText(/OCR does not run in Expo Go/)).toBeOnTheScreen();
  });

  it('points at the typed route as the fallback when OCR is unavailable', async () => {
    resetOcr({ moduleMissing: true });
    await renderWithCamera();

    await waitFor(() =>
      expect(screen.getByText('Development build required')).toBeOnTheScreen()
    );
    expect(screen.getByText(/use Type ingredients instead/)).toBeOnTheScreen();
  });

  it('shows no warning when the module is present', async () => {
    resetOcr({ supported: true });
    await renderWithCamera();

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    expect(screen.queryByText('Development build required')).toBeNull();
  });

  it('still allows a photo to be taken when OCR is unavailable', async () => {
    resetOcr({ supported: false });
    await renderWithCamera();

    await waitFor(() => expect(takePhoto()).toBeEnabled());
  });
});

// ---------------------------------------------------------------------------
// Capture and recognition
// ---------------------------------------------------------------------------

describe('capturing a photo', () => {
  it('runs recognition as part of the capture, with no second tap', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    expect(ocr.calls).toBe(1);
  });

  it('fills the editor with the ingredient block it extracted', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    await waitFor(() => expect(editor().props.value).toContain('Refined Wheat Flour'));
    expect(editor().props.value).toContain('CONTAINS: WHEAT, MILK');
  });

  it('drops the regulatory tail, which is not an ingredient', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    expect(editor().props.value).not.toContain('Nutrition Information');
  });

  it('asks for a higher-quality capture than a thumbnail', async () => {
    // Small print is the main reason a label fails to read.
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    expect(camera.captureOptions).toEqual({ quality: 0.85 });
  });

  it('shows the captured photo in place of the viewfinder', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    await waitFor(() => expect(screen.getByLabelText('Captured food label')).toBeTruthy());
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  it('offers a retake, which clears the photo and the text', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();
    await waitFor(() => expect(editor().props.value).toContain('Wheat'));

    await fireEvent.press(screen.getByLabelText('Retake photo'));

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    // The whole editor group is conditional on a photo, so a retake removes it
    // rather than leaving an empty box the user has to notice.
    expect(screen.queryByLabelText('Recognized ingredients text')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Analyse ingredients' })).toBeNull();
  });

  it('re-enables Take photo after a retake, so a second attempt is possible', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();
    await fireEvent.press(screen.getByLabelText('Retake photo'));

    await waitFor(() => expect(takePhoto()).toBeEnabled());
  });

  it('alerts when the photo is not a label', async () => {
    resetOcr({ text: NOT_A_LABEL });
    await renderWithCamera();

    await capture();

    expect(alerts.at(-1)?.title).toBe('Ingredients Not Found');
    expect(alerts.at(-1)?.message).toMatch(/Retake it with the ingredient panel/);
  });

  it('flags in the editor that no ingredient list was located', async () => {
    resetOcr({ text: NOT_A_LABEL });
    await renderWithCamera();

    await capture();

    await waitFor(() =>
      expect(screen.getByText('Ingredient list not located')).toBeOnTheScreen()
    );
  });

  it('does not flag a read where a header was found', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    expect(screen.queryByText('Ingredient list not located')).toBeNull();
  });

  it('still shows the unrecognised text so the user can correct it by hand', async () => {
    // Discarding the text would force a retake even when the user could read it.
    resetOcr({ text: 'Rice flour, Contains Soy' });
    await renderWithCamera();

    await capture();

    await waitFor(() => expect(editor().props.value).toContain('Contains Soy'));
  });

  it('reports an empty recognition as not found', async () => {
    resetOcr({ text: '' });
    await renderWithCamera();

    await capture();

    expect(alerts.at(-1)?.title).toBe('Ingredients Not Found');
  });

  it('offers Read text when recognition produced nothing', async () => {
    resetOcr({ text: '' });
    await renderWithCamera();

    await capture();

    await waitFor(() => expect(readText()).toBeOnTheScreen());
  });

  it('hides Read text once text is in the editor', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    expect(screen.queryByRole('button', { name: 'Read text' })).toBeNull();
  });

  it('explains the development build requirement when the native module is absent', async () => {
    resetOcr({ throws: 'native module not found' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderWithCamera();

    await capture();

    expect(alerts.at(-1)?.title).toBe('Development Build Required');
    expect(alerts.at(-1)?.message).toMatch(/eas build --profile development/);
  });

  it('offers the editor after a recognition failure rather than dead-ending', async () => {
    resetOcr({ throws: 'recognition failed' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderWithCamera();

    await capture();

    expect(alerts.at(-1)?.title).toBe('OCR Error');
    expect(screen.getByLabelText('Recognized ingredients text')).toBeTruthy();
  });

  it('surfaces a capture failure as an error rather than a crash', async () => {
    await renderWithCamera();
    camera.captureThrows = true;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await waitFor(() => expect(takePhoto()).toBeEnabled());
    await fireEvent.press(takePhoto());

    await waitFor(() =>
      expect(alerts.at(-1)).toMatchObject({
        title: 'Error',
        message: 'Failed to take picture. Please try again.',
      })
    );
  });

  it('ignores a capture that produced no file', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();
    camera.captureReturnsNothing = true;

    await waitFor(() => expect(takePhoto()).toBeEnabled());
    await fireEvent.press(takePhoto());

    // No photo, so no recognition and no navigation.
    expect(ocr.calls).toBe(0);
    expect(navigatedTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Torch
// ---------------------------------------------------------------------------

describe('torch', () => {
  it('starts off and toggles on', async () => {
    await renderWithCamera();

    await waitFor(() => expect(screen.getByLabelText('Turn flash on')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Turn flash on'));

    await waitFor(() => expect(screen.getByLabelText('Turn flash off')).toBeTruthy());
  });

  it('toggles back off', async () => {
    await renderWithCamera();

    await waitFor(() => expect(screen.getByLabelText('Turn flash on')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Turn flash on'));
    await waitFor(() => expect(screen.getByLabelText('Turn flash off')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Turn flash off'));

    await waitFor(() => expect(screen.getByLabelText('Turn flash on')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Analysing a photo
// ---------------------------------------------------------------------------

describe('analysing a photographed label', () => {
  async function captureAndAnalyse(label: string) {
    resetOcr({ text: label });
    await renderWithCamera();

    await capture();
    await waitFor(() => expect(analyse()).toBeEnabled());
    await fireEvent.press(analyse());
  }

  it('replaces the screen with the result', async () => {
    await captureAndAnalyse(READABLE_LABEL);

    expect(navigatedTo()).toEqual(['/result']);
  });

  it('reports a declared allergen as unsafe', async () => {
    await captureAndAnalyse(READABLE_LABEL);

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.verdict).toBe('unsafe');
    expect(stored.source).toBe('label');
    expect(stored.insufficientData).toBe(false);
  });

  it('still reports unsafe when OCR merged the header with the ingredients', async () => {
    await captureAndAnalyse(MERGED_HEADER_LABEL);

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.verdict).toBe('unsafe');
  });

  it('stamps the ruleset version used for the verdict', async () => {
    await captureAndAnalyse(READABLE_LABEL);

    expect(appHistoryModule().getScansPage()[0].rulesetVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('copies the photo out of the cache before storing it', async () => {
    fakeFileSystem().seedFile(camera.captureUri, 'jpeg');
    await captureAndAnalyse(READABLE_LABEL);

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.imageUri).toMatch(/^file:\/\/\/documents\/scans\//);
    expect(stored.imageUri).not.toBe(camera.captureUri);
  });

  it('records the scan even when the photo cannot be stored', async () => {
    // Losing the thumbnail must not lose the verdict.
    resetOcr({ text: READABLE_LABEL });
    fakeFileSystem().breakFakeFileSystem();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderWithCamera();

    await capture();
    await waitFor(() => expect(analyse()).toBeEnabled());
    await fireEvent.press(analyse());

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.verdict).toBe('unsafe');
    expect(stored.imageUri).toBeUndefined();
  });

  it('never presents a photo with no located ingredient list as clean', async () => {
    // The safety-critical case: text was read, but none of it was an ingredient
    // list, so the verdict is meaningless and must be refused.
    resetOcr({ text: NOT_A_LABEL });
    await renderWithCamera();

    await capture();
    await waitFor(() =>
      expect(screen.getByText('Ingredient list not located')).toBeOnTheScreen()
    );
    await fireEvent.press(analyse());

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.insufficientData).toBe(true);
    expect(stored.verdict).toBe('safe');
  });

  it('lets the user edit the recognised text before analysing', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();
    await waitFor(() => expect(editor().props.value).toContain('Wheat'));

    await fireEvent.changeText(editor(), 'Rice Flour, Sugar, Salt');
    await fireEvent.press(analyse());

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.rawText).toBe('Rice Flour, Sugar, Salt');
    expect(stored.verdict).toBe('safe');
    expect(stored.insufficientData).toBe(false);
  });

  it('lets a correction clear an unreadable read', async () => {
    // The user photographs the wrong panel, then types the real list. The
    // correction has to clear `insufficientData`, which the OCR guard set.
    resetOcr({ text: NOT_A_LABEL });
    await renderWithCamera();

    await capture();
    await waitFor(() =>
      expect(screen.getByText('Ingredient list not located')).toBeOnTheScreen()
    );

    await fireEvent.changeText(editor(), 'Rice Flour, Sugar, Salt');
    await fireEvent.press(analyse());

    const [stored] = appHistoryModule().getScansPage();
    expect(stored.insufficientData).toBe(true);
    expect(stored.rawText).toBe('Rice Flour, Sugar, Salt');
  });

  it('counts the items the editor shows, ignoring blank separators', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();

    // Three ingredient lines, one allergen line, plus the split on commas.
    await waitFor(() => expect(screen.getByText(/7 items/)).toBeTruthy());
  });

  it('disables Analyse once the editor is cleared, rather than stranding it', async () => {
    resetOcr({ text: READABLE_LABEL });
    await renderWithCamera();

    await capture();
    await waitFor(() => expect(analyse()).toBeEnabled());

    await fireEvent.changeText(editor(), '   ');

    await waitFor(() => expect(analyse()).toBeDisabled());
  });
});