/**
 * An in-memory stand-in for `expo-file-system`.
 *
 * Only the `Directory`, `File` and `Paths` surface that `src/storage/scanImages.ts`
 * uses is modelled. Files are held in a flat map keyed by URI, so a test can
 * assert that a capture was copied out of the cache and that deleting a scan
 * removes the copy rather than orphaning it.
 */

export interface FakeFsFile {
  exists: boolean;
  contents: string;
}

interface FakeFsState {
  files: Map<string, FakeFsFile>;
  /** When true, every file operation throws, for testing the failure paths. */
  broken: boolean;
}

let state: FakeFsState = { files: new Map(), broken: false };

const DOCUMENT = 'file:///documents/';

function assertWorking(): void {
  if (state.broken) {
    throw new Error('FakeFileSystem: filesystem unavailable');
  }
}

export function resetFakeFileSystem(): void {
  state = { files: new Map(), broken: false };
}

export function breakFakeFileSystem(): void {
  state.broken = true;
}

/** Every file that still exists, for asserting copies and deletions. */
export function fileUris(): string[] {
  return Array.from(state.files.entries())
    .filter(([, file]) => file.exists)
    .map(([uri]) => uri)
    .sort();
}

export function seedFile(uri: string, contents = 'jpeg-bytes'): void {
  state.files.set(uri, { exists: true, contents });
}

class FakeFile {
  readonly uri: string;

  /** Accepts a path, a URI string, or a `(Directory, name)` pair. */
  constructor(parent: string | { uri: string }, name?: string) {
    const base = typeof parent === 'string' ? parent : parent.uri;
    this.uri = name ? `${base.replace(/\/$/, '')}/${name}` : base;
  }

  get exists(): boolean {
    return state.files.get(this.uri)?.exists ?? false;
  }

  copySync(destination: FakeFile): void {
    assertWorking();
    const source = state.files.get(this.uri);
    if (!source) throw new Error(`FakeFileSystem: cannot copy missing file ${this.uri}`);
    state.files.set(destination.uri, { exists: true, contents: source.contents });
  }

  delete(): void {
    assertWorking();
    const entry = state.files.get(this.uri);
    if (entry) entry.exists = false;
  }
}

class FakeDirectory {
  readonly uri: string;
  readonly path: string;

  constructor(parent: string | { uri: string }, name?: string) {
    const base = typeof parent === 'string' ? parent : parent.uri;
    this.uri = name ? `${base.replace(/\/$/, '')}/${name}` : base;
    this.path = this.uri;
  }

  get exists(): boolean {
    return Array.from(state.files.keys()).some(uri => uri.startsWith(`${this.uri}/`));
  }

  create(): void {
    assertWorking();
  }

  delete(): void {
    assertWorking();
    for (const uri of Array.from(state.files.keys())) {
      if (uri.startsWith(`${this.uri}/`)) state.files.delete(uri);
    }
  }
}

export function createFakeFileSystem() {
  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: { document: { uri: DOCUMENT, path: DOCUMENT } },
  };
}