/**
 * History persistence.
 *
 * Two things matter here beyond ordinary CRUD. First, migrations: an install
 * that upgrades must gain every new column, and a column that is never added is a
 * runtime crash on the first query that reads it. Second, `insufficient_data`:
 * a scan that could not be read has to stay unreadable after a restart, otherwise
 * history quietly re-presents it as an ordinary result.
 */
import type { ScanResult } from '../rules/types';

import { installFakeSqlite, loadHistoryModule } from '@test/fakes/sqlite';
import type { HistoryModule } from '@test/fakes/sqlite';
import {
  breakFakeFileSystem,
  createFakeFileSystem,
  fileUris,
  resetFakeFileSystem,
  seedFile,
} from '@test/fakes/fakeFileSystem';

const CACHE_URI = 'file:///cache/Camera/scan.jpg';

let sqlite: ReturnType<typeof installFakeSqlite>;
let history: HistoryModule;

function scan(over: Partial<ScanResult> = {}): ScanResult {
  return {
    source: 'label',
    rawIngredients: 'Wheat Flour, Sugar. Contains: Milk',
    parsed: { ingredients: ['Wheat Flour', 'Sugar'], declaredAllergens: ['Milk'], mayContain: [] },
    flags: [
      {
        id: 'allergen:milk',
        severity: 'unsafe',
        label: 'Milk',
        reason: 'test',
        category: 'allergen',
      },
    ],
    verdict: 'unsafe',
    insufficientData: false,
    vegMark: 'unknown',
    offAttribution: false,
    createdAt: '2026-01-15T09:00:00.000Z',
    rulesetVersion: '2.1.0',
    ...over,
  };
}

beforeEach(() => {
  jest.resetModules();
  sqlite = installFakeSqlite();
  resetFakeFileSystem();
  jest.doMock('expo-file-system', () => createFakeFileSystem());
  history = loadHistoryModule();
});

describe('migrations', () => {
  it('creates the table and applies every migration on first open', () => {
    history.initDatabase();

    const db = sqlite.db();
    expect(db.version()).toBe(4);
    expect(db.columns('scans')).toEqual([
      'id',
      'barcode',
      'product_name',
      'image_uri',
      'raw_text',
      'verdict',
      'flags_json',
      'may_contain_json',
      'veg_mark',
      'source',
      'created_at',
      'brands',
      'off_url',
      'ruleset_version',
      'ingredients_json',
      'declared_allergens_json',
      'insufficient_data',
      'coverage',
      'ai_provenance_json',
    ]);
  });

  it('creates the index the paginated list query relies on', () => {
    history.initDatabase();

    expect(
      sqlite.db().countOf(sql => /^CREATE INDEX/i.test(sql))
    ).toBeGreaterThan(0);
  });

  it('does not re-run migrations that the stored user_version already covers', () => {
    history.initDatabase();
    const addsAfterFirstOpen = sqlite.db().countOf(sql => /^ALTER TABLE/i.test(sql));

    // A second screen touching history must not re-add a column.
    history.initDatabase();

    expect(sqlite.db().countOf(sql => /^ALTER TABLE/i.test(sql))).toBe(addsAfterFirstOpen);
  });

  it('adds insufficient_data as NOT NULL with a default so old rows stay readable', () => {
    history.initDatabase();

    const migration = sqlite
      .db()
      .statements.map(s => s.sql)
      .find(sql => /insufficient_data/i.test(sql) && /^ALTER TABLE/i.test(sql));

    expect(migration).toMatch(/NOT NULL DEFAULT 0/i);
  });
});

describe('saveScan', () => {
  it('returns the new row id', () => {
    expect(history.saveScan(scan())).toBe(1);
  });

  it('binds every column so no value lands in the wrong field', () => {
    history.saveScan(scan());

    const row = sqlite.db().rows('scans')[0];
    expect(row.raw_text).toBe('Wheat Flour, Sugar. Contains: Milk');
    expect(row.verdict).toBe('unsafe');
    expect(row.ruleset_version).toBe('2.1.0');
    expect(JSON.parse(row.declared_allergens_json as string)).toEqual(['Milk']);
    expect(JSON.parse(row.ingredients_json as string)).toEqual(['Wheat Flour', 'Sugar']);
  });

  it('stores insufficient_data as 1 and 0, not a boolean string', () => {
    // SQLite has no boolean type; a "true" string would compare as truthy but
    // break a numeric read. Rows are inspected in insertion order here, so the
    // unreadable scan comes first.
    history.saveScan(scan({ insufficientData: true }));
    history.saveScan(scan({ insufficientData: false }));

    const rows = sqlite.db().rows('scans');
    expect(rows.map(row => row.insufficient_data)).toEqual([1, 0]);
  });

  it('round-trips an unreadable scan as unreadable', () => {
    history.saveScan(scan({ verdict: 'safe', insufficientData: true }));

    const [stored] = history.getScansPage();

    expect(stored.insufficientData).toBe(true);
    expect(stored.verdict).toBe('safe');
  });

  it('writes nulls for absent optional fields rather than empty strings', () => {
    history.saveScan(scan());

    const row = sqlite.db().rows('scans')[0];
    expect(row.barcode).toBeNull();
    expect(row.product_name).toBeNull();
    expect(row.off_url).toBeNull();
  });

  it('copies a cache capture out of the cache and stores the durable URI', () => {
    seedFile(CACHE_URI);

    history.saveScan(scan({ imageUrl: CACHE_URI }));

    const row = sqlite.db().rows('scans')[0] as { image_uri: string };
    expect(row.image_uri).toMatch(/^file:\/\/\/documents\/scans\//);
    expect(row.image_uri).not.toBe(CACHE_URI);
  });

  it('drops a remote product image URL instead of storing it', () => {
    // Known gap, recorded rather than papered over. `persistScanImage` is called
    // with `scan.imageUrl` and only knows about local files, so an Open Food
    // Facts `image_front_url` resolves to a non-existent File and comes back
    // null. Every barcode scan therefore loses its product image when saved,
    // and reopening it from history renders the placeholder cube instead.
    //
    // Fix: return the input unchanged when it is not a local file URI.
    history.saveScan(scan({ imageUrl: 'https://images.openfoodfacts.org/p/1.jpg' }));

    expect(sqlite.db().rows('scans')[0].image_uri).toBeNull();
  });

  it('still records the scan when the photo cannot be copied', () => {
    breakFakeFileSystem();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    history.saveScan(scan({ imageUrl: CACHE_URI }));

    // The verdict matters more than the thumbnail.
    expect(sqlite.db().rows('scans')).toHaveLength(1);
    expect(sqlite.db().rows('scans')[0].image_uri).toBeNull();

    warn.mockRestore();
  });
});

describe('getScansPage', () => {
  function seed(count: number) {
    for (let i = 0; i < count; i++) {
      history.saveScan(
        scan({ createdAt: new Date(Date.UTC(2026, 0, 15, 9, 0, i)).toISOString() })
      );
    }
  }

  it('defaults to a 25 row page', () => {
    expect(history.DEFAULT_PAGE_SIZE).toBe(25);
    seed(30);

    expect(history.getScansPage()).toHaveLength(25);
  });

  it('orders newest first', () => {
    history.saveScan(scan({ createdAt: '2026-01-01T00:00:00.000Z', productName: 'Older' }));
    history.saveScan(scan({ createdAt: '2026-02-01T00:00:00.000Z', productName: 'Newer' }));

    expect(history.getScansPage().map(row => row.productName)).toEqual(['Newer', 'Older']);
  });

  it('breaks a created_at tie on id, so pagination cannot repeat or skip a row', () => {
    const sameInstant = '2026-01-15T09:00:00.000Z';
    for (const name of ['A', 'B', 'C']) {
      history.saveScan(scan({ createdAt: sameInstant, productName: name }));
    }

    const first = history.getScansPage(2, 0);
    const second = history.getScansPage(2, 2);

    expect([...first, ...second].map(row => row.productName)).toEqual(['C', 'B', 'A']);
  });

  it('returns nothing past the end of the list', () => {
    seed(3);

    expect(history.getScansPage(10, 10)).toEqual([]);
  });

  it('reads back every column the result screen needs', () => {
    history.saveScan(
      scan({
        source: 'barcode',
        barcode: '8901063162914',
        productName: 'Biscuits',
        brands: 'Test Foods',
        offUrl: 'https://world.openfoodfacts.org/product/8901063162914',
        parsed: { ingredients: ['Wheat Flour'], declaredAllergens: ['Milk'], mayContain: ['Nuts'] },
      })
    );

    const [stored] = history.getScansPage();

    expect(stored).toMatchObject({
      barcode: '8901063162914',
      productName: 'Biscuits',
      brands: 'Test Foods',
      offUrl: 'https://world.openfoodfacts.org/product/8901063162914',
      source: 'barcode',
      rulesetVersion: '2.1.0',
      vegMark: 'unknown',
      insufficientData: false,
    });
    expect(JSON.parse(stored.flagsJson)).toHaveLength(1);
  });
});

describe('countScans', () => {
  it('is zero on a fresh install', () => {
    expect(history.countScans()).toBe(0);
  });

  it('counts every scan regardless of verdict', () => {
    history.saveScan(scan({ verdict: 'safe' }));
    history.saveScan(scan({ verdict: 'unsafe' }));
    history.saveScan(scan({ verdict: 'caution', insufficientData: true }));

    expect(history.countScans()).toBe(3);
  });
});

describe('getScanById', () => {
  it('returns the stored scan', () => {
    const id = history.saveScan(scan({ productName: 'Biscuits' }));

    expect(history.getScanById(id)?.productName).toBe('Biscuits');
  });

  it('returns null for an id that does not exist', () => {
    expect(history.getScanById(999)).toBeNull();
  });

  it('falls back safely on a malformed JSON column', () => {
    // A partially written row must not crash the history screen.
    const id = history.saveScan(scan());
    const db = sqlite.db();
    const row = db.rows('scans').find(candidate => candidate.id === id)!;
    row.declared_allergens_json = '{not json';

    expect(() => history.getScanById(id)).not.toThrow();
  });
});

describe('deleteScan', () => {
  it('removes only the requested row', () => {
    const keep = history.saveScan(scan({ productName: 'Keep' }));
    const remove = history.saveScan(scan({ productName: 'Remove' }));

    history.deleteScan(remove);

    expect(history.countScans()).toBe(1);
    expect(history.getScanById(keep)?.productName).toBe('Keep');
  });

  it('removes the stored photo along with the row', () => {
    seedFile(CACHE_URI);
    const id = history.saveScan(scan({ imageUrl: CACHE_URI }));
    const stored = sqlite.db().rows('scans')[0].image_uri as string;
    expect(fileUris()).toContain(stored);

    history.deleteScan(id);

    expect(fileUris()).not.toContain(stored);
  });

  it('is a no-op for an id that does not exist', () => {
    history.saveScan(scan());

    expect(() => history.deleteScan(999)).not.toThrow();
    expect(history.countScans()).toBe(1);
  });
});

describe('clearHistory', () => {
  it('removes every row', () => {
    history.saveScan(scan());
    history.saveScan(scan());

    history.clearHistory();

    expect(history.countScans()).toBe(0);
  });

  it('removes every stored photo', () => {
    seedFile(CACHE_URI);
    history.saveScan(scan({ imageUrl: CACHE_URI }));
    history.saveScan(scan({ imageUrl: CACHE_URI }));

    history.clearHistory();

    expect(fileUris().some(uri => uri.startsWith('file:///documents/scans/'))).toBe(false);
  });

  it('is a no-op on an empty history', () => {
    expect(() => history.clearHistory()).not.toThrow();
  });
});

describe('isVerdict', () => {
  it.each(['safe', 'caution', 'unsafe'])('accepts %s', value => {
    expect(history.isVerdict(value)).toBe(true);
  });

  it.each(['', 'SAFE', 'unknown', 'not-read'])('rejects %p', value => {
    expect(history.isVerdict(value)).toBe(false);
  });
});

describe('failure handling', () => {
  it('leaves the schema at the last good version when a migration throws', () => {
    // A failed migration must not leave a half-built table that later queries
    // would read from.
    sqlite.failOnOpen(new Error('disk full'));

    expect(() => history.initDatabase()).toThrow('disk full');
    expect(sqlite.db().version()).toBe(0);
  });

  it('opens the database file lazily, only when history is touched', () => {
    expect(sqlite.openCount()).toBe(0);

    history.initDatabase();

    expect(sqlite.openCount()).toBe(1);
    expect(sqlite.openedNames()).toEqual(['truelabels.db']);
  });

  it('reuses a single connection across screens', () => {
    history.initDatabase();
    history.getScansPage();
    history.countScans();

    expect(sqlite.openCount()).toBe(1);
  });
});