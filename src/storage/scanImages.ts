import { Directory, File, Paths } from 'expo-file-system';

const SCAN_IMAGE_DIR = 'scans';

function scanImageDir(): Directory {
  const dir = new Directory(Paths.document, SCAN_IMAGE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function isLocalFile(uri?: string | null): uri is string {
  return !!uri && (uri.startsWith('file://') || uri.startsWith('/'));
}

/**
 * `takePictureAsync` returns a URI in the cache directory, which the system is
 * free to delete at any time. A history entry that points at it renders as a
 * broken image, so photos are copied into the document directory before being
 * stored. Remote URLs (Open Food Facts product images) are left alone.
 */
export function persistScanImage(cacheUri: string): string | null {
  try {
    const source = new File(cacheUri);
    if (!source.exists) return null;
    const name = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const target = new File(scanImageDir(), name);
    source.copySync(target);
    return target.uri;
  } catch (error) {
    console.warn('Failed to persist scan image:', error);
    return null;
  }
}

export function deleteScanImage(uri?: string | null): void {
  if (!isLocalFile(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Failed to delete scan image:', error);
  }
}

export function deleteAllScanImages(): void {
  try {
    const dir = new Directory(Paths.document, SCAN_IMAGE_DIR);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('Failed to delete scan images:', error);
  }
}
