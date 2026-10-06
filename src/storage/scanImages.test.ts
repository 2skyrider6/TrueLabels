/**
 * Scan image persistence.
 *
 * `takePictureAsync` hands back a URI in the cache directory, which the OS may
 * delete at any time. A history row pointing at it renders as a broken image, so
 * the photo is copied into the document directory before it is stored. These tests
 * pin that copy, and pin what happens when the copy cannot be made: the scan must
 * still be recorded, just without a photo.
 */
const CACHE_URI = 'file:///cache/Camera/scan-1.jpg';
const DOCUMENT_URI = 'file:///documents/';

type ScanImagesModule = typeof import('./scanImages');

let mod: ScanImagesModule;
let fs: typeof import('@test/fakes/fakeFileSystem');

beforeEach(() => {
  jest.resetModules();
  // Required after `resetModules`, so the fake and the module under test resolve
  // through the same registry entry.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fs = require('@test/fakes/fakeFileSystem') as typeof import('@test/fakes/fakeFileSystem');
  fs.resetFakeFileSystem();
  jest.doMock('expo-file-system', () => fs.createFakeFileSystem());
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('./scanImages') as ScanImagesModule;
});

describe('persistScanImage', () => {
  it('copies a cache capture into the document directory', () => {
    fs.seedFile(CACHE_URI);

    const stored = mod.persistScanImage(CACHE_URI);

    expect(stored).toMatch(/^file:\/\/\/documents\/scans\/scan-\d+-[a-z0-9]+\.jpg$/);
    expect(fs.fileUris()).toContain(CACHE_URI);
    expect(fs.fileUris().some(uri => uri.startsWith(`${DOCUMENT_URI}scans/`))).toBe(true);
  });

  it('copies the bytes rather than moving them, leaving the cache entry intact', () => {
    // A move would break a retake that still references the cache URI.
    fs.seedFile(CACHE_URI, 'jpeg-bytes');

    const stored = mod.persistScanImage(CACHE_URI);

    expect(fs.fileUris()).toContain(CACHE_URI);
    expect(stored).not.toBeNull();
  });

  it('generates a different name each time, so a retake is not overwritten', () => {
    fs.seedFile(CACHE_URI);

    const first = mod.persistScanImage(CACHE_URI);
    const second = mod.persistScanImage(CACHE_URI);

    expect(first).not.toBe(second);
    expect(fs.fileUris().filter(uri => uri.startsWith(`${DOCUMENT_URI}scans/`))).toHaveLength(2);
  });

  it('returns null when the capture has already been evicted from the cache', () => {
    expect(mod.persistScanImage(CACHE_URI)).toBeNull();
  });

  it('returns null rather than throwing when the filesystem is unavailable', () => {
    // Storage failure must not lose the scan. The row is written without a photo
    // and the user still gets their verdict.
    fs.seedFile(CACHE_URI);
    fs.breakFakeFileSystem();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(mod.persistScanImage(CACHE_URI)).toBeNull();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('deleteScanImage', () => {
  it('removes a stored photo', () => {
    fs.seedFile(CACHE_URI);
    const stored = mod.persistScanImage(CACHE_URI)!;

    mod.deleteScanImage(stored);

    expect(fs.fileUris()).not.toContain(stored);
    // The cache copy is not ours to delete.
    expect(fs.fileUris()).toContain(CACHE_URI);
  });

  it('ignores a remote product image URL', () => {
    // Open Food Facts images live on a server; a "delete" must not become a
    // network request or an exception.
    expect(() =>
      mod.deleteScanImage('https://images.openfoodfacts.org/images/products/1/front.jpg')
    ).not.toThrow();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
  ])('is a no-op for %s', (_label, value) => {
    expect(() => mod.deleteScanImage(value)).not.toThrow();
  });

  it('is a no-op when the file is already gone', () => {
    fs.seedFile(CACHE_URI);
    const stored = mod.persistScanImage(CACHE_URI)!;

    mod.deleteScanImage(stored);
    expect(() => mod.deleteScanImage(stored)).not.toThrow();
  });

  it('does not throw when the filesystem is unavailable', () => {
    fs.seedFile(CACHE_URI);
    const stored = mod.persistScanImage(CACHE_URI)!;
    fs.breakFakeFileSystem();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => mod.deleteScanImage(stored)).not.toThrow();

    warn.mockRestore();
  });
});

describe('deleteAllScanImages', () => {
  it('removes every stored photo', () => {
    fs.seedFile(CACHE_URI);
    mod.persistScanImage(CACHE_URI);
    mod.persistScanImage(CACHE_URI);

    mod.deleteAllScanImages();

    expect(fs.fileUris().filter(uri => uri.startsWith(`${DOCUMENT_URI}scans/`))).toHaveLength(0);
  });

  it('is a no-op when nothing has been stored', () => {
    expect(() => mod.deleteAllScanImages()).not.toThrow();
  });

  it('does not throw when the filesystem is unavailable', () => {
    fs.breakFakeFileSystem();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => mod.deleteAllScanImages()).not.toThrow();

    warn.mockRestore();
  });
});