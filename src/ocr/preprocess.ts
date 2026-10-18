/**
 * Image preprocessing for OCR enhancement.
 *
 * This module provides image preprocessing helpers for the OCR pipeline.
 * Note: react-native-image-filter-kit is a React component library (not a
 * plain function API), so direct image processing in this module is limited.
 * The multi-pass OCR orchestrator handles variations by running OCR multiple
 * times; preprocessing can be added later via a React Native component that
 * renders ImageFilterKit components and emits results via onExtractImage.
 *
 * For now, this module passes through the original URI and reports a
 * conservative confidence. The OCR orchestrator runs multiple passes to
 * improve robustness.
 */

/**
 * Result of preprocessing an image.
 */
export interface PreprocessResult {
  /** URI of the preprocessed image (or original if preprocessing not applied). */
  uri: string;
  /** Confidence that preprocessing improved OCR suitability (0-1). */
  confidence: number;
  /** Names of filters that were successfully applied. */
  appliedFilters: string[];
}

/**
 * Preprocesses a label image to improve OCR accuracy.
 *
 * Currently returns the original URI unchanged. Future enhancement: integrate
 * with react-native-image-filter-kit (React component) for contrast,
 * brightness, sharpen, and noise filters.
 *
 * @param uri - File URI of the source image (typically from camera).
 * @param options - Optional filter overrides (currently not applied).
 * @returns PreprocessResult with the URI and metadata.
 */
export async function preprocessImage(
  uri: string,
  _options?: PreprocessOptions
): Promise<PreprocessResult> {
  // Return the original URI. Image filtering via react-native-image-filter-kit
  // requires React components (onExtractImage callback), which cannot be used
  // in a plain async function. Future work: create a React Native component
  // wrapper that applies filters and emits the result URI.
  return {
    uri,
    confidence: 0.5,
    appliedFilters: [],
  };
}

/**
 * Preprocesses an image for small text.
 * Currently just returns the original URI.
 */
export async function preprocessForSmallText(uri: string): Promise<PreprocessResult> {
  return preprocessImage(uri);
}

/**
 * PreprocessOptions type - kept for API compatibility.
 * Future: contrast, brightness, sharpen, noise, grayscale options.
 */
export interface PreprocessOptions {
  contrast?: number;
  brightness?: number;
  sharpen?: number;
  noise?: number;
  grayscale?: boolean;
}