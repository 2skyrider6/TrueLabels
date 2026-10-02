import { barcodeVariants, isProductBarcode } from './client';

describe('isProductBarcode', () => {
  test('accepts 8-14 digit product codes', () => {
    expect(isProductBarcode('8901063162914')).toBe(true);
    expect(isProductBarcode('3017620422003')).toBe(true);
    expect(isProductBarcode('96385074')).toBe(true);
  });

  test('rejects QR payloads and malformed codes', () => {
    expect(isProductBarcode('https://example.com/product/1')).toBe(false);
    expect(isProductBarcode('1234567')).toBe(false);
    expect(isProductBarcode('123456789012345')).toBe(false);
  });
});

describe('barcodeVariants', () => {
  test('always includes the scanned code itself', () => {
    expect(barcodeVariants('8901063162914')).toContain('8901063162914');
  });

  test('pads a 12 digit UPC-A to EAN-13', () => {
    // The same GTIN is stored inconsistently, so both encodings are tried.
    expect(barcodeVariants('017620422003')).toContain('0017620422003');
  });

  test('strips a single leading zero from a 13 digit code', () => {
    expect(barcodeVariants('0017620422003')).toContain('017620422003');
  });

  test('does not mangle a 13 digit code that does not start with zero', () => {
    const variants = barcodeVariants('8901063162914');
    expect(variants).toEqual(['8901063162914']);
  });

  test('drops only the ITF-14 wrapper digit', () => {
    const variants = barcodeVariants('08901063162914');
    expect(variants).toContain('8901063162914');
  });

  test('never returns duplicates', () => {
    const variants = barcodeVariants('08901063162914');
    expect(new Set(variants).size).toBe(variants.length);
  });

  test('returns a non-numeric payload unchanged rather than guessing', () => {
    const variants = barcodeVariants('abc123');
    expect(variants).toEqual(['abc123']);
  });
});