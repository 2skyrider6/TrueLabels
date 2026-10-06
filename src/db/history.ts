import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';
import { ScanResult, Verdict } from '../rules/types';
import type { AiProvenance, Coverage } from '../ai/types';
import { deleteAllScanImages, deleteScanImage, persistScanImage } from '../storage/scanImages';

const DB_NAME = 'truelabels.db';

let database: SQLite.SQLiteDatabase | null = null;

/**
 * Applies any migration newer than the stored `user_version`, each in its own
 * transaction so a failure leaves the database on the last good version.
 */
function migrate(db: SQLite.SQLiteDatabase): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.withTransactionSync(() => {
      db.execSync(migration.sql);
      db.execSync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}

/** Opened lazily so a screen that never touches history never opens the database. */
function getDb(): SQLite.SQLiteDatabase {
  if (!database) {
    database = SQLite.openDatabaseSync(DB_NAME);
    migrate(database);
  }
  return database;
}

/**
 * Shared connection handle.
 *
 * Exported so other modules query the same connection. Opening a second handle
 * to the same WAL database invites lock contention for no benefit.
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  return getDb();
}

export function initDatabase(): void {
  getDb();
}

export interface HistoryScan {
  id: number;
  barcode?: string;
  productName?: string;
  brands?: string;
  imageUri?: string;
  rawText: string;
  verdict: string;
  flagsJson: string;
  mayContainJson: string;
  declaredAllergensJson: string;
  ingredientsJson: string;
  rulesetVersion?: string;
  offUrl?: string;
  vegMark: 'veg' | 'non-veg' | 'unknown';
  source: 'barcode' | 'label' | 'manual';
  createdAt: string;
  /** The label could not be read; `verdict` is not trustworthy for this row. */
  insufficientData: boolean;
  coverage?: Coverage;
  aiProvenance?: AiProvenance;
  normalisedIngredients?: string[];
}

export function saveScan(scan: ScanResult): number {
  // The captured photo lives in the cache directory, so move it somewhere durable
  // before recording its location.
  const imageUri = scan.imageUrl ? persistScanImage(scan.imageUrl) : null;

  const result = getDb().runSync(
    `INSERT INTO scans (
       barcode, product_name, brands, image_uri, raw_text, verdict, flags_json,
       may_contain_json, declared_allergens_json, ingredients_json,
       ruleset_version, off_url, veg_mark, source, created_at, insufficient_data,
       coverage, ai_provenance_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    scan.barcode || null,
    scan.productName || null,
    scan.brands || null,
    imageUri,
    scan.rawIngredients,
    scan.verdict,
    JSON.stringify(scan.flags),
    JSON.stringify(scan.parsed.mayContain),
    JSON.stringify(scan.parsed.declaredAllergens),
    JSON.stringify(scan.parsed.ingredients),
    scan.rulesetVersion,
    scan.offUrl || null,
    scan.vegMark,
    scan.source,
    scan.createdAt,
    scan.insufficientData ? 1 : 0,
    // Absent coverage on a pre-v4 row means the backfill could not establish
    // trust, so it is stored as unverified rather than optimistically verified.
    scan.coverage ?? 'unverified',
    scan.aiProvenance ? JSON.stringify(scan.aiProvenance) : null
  );
  return result.lastInsertRowId;
}

interface DbScanRow {
  id: number;
  barcode: string | null;
  product_name: string | null;
  brands: string | null;
  image_uri: string | null;
  raw_text: string;
  verdict: string;
  flags_json: string;
  may_contain_json: string | null;
  declared_allergens_json: string | null;
  ingredients_json: string | null;
  ruleset_version: string | null;
  off_url: string | null;
  veg_mark: string | null;
  source: string;
  created_at: string;
  insufficient_data: number | null;
  coverage: string | null;
  ai_provenance_json: string | null;
}

const COVERAGE_VALUES = new Set<Coverage>(['verified', 'unverified']);

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    // A malformed blob must not break the whole history list.
    return fallback;
  }
}

function mapRowToHistoryScan(row: DbScanRow): HistoryScan {
  return {
    id: row.id,
    barcode: row.barcode ?? undefined,
    productName: row.product_name ?? undefined,
    brands: row.brands ?? undefined,
    imageUri: row.image_uri ?? undefined,
    rawText: row.raw_text,
    verdict: row.verdict,
    flagsJson: row.flags_json,
    mayContainJson: row.may_contain_json ?? '[]',
    declaredAllergensJson: row.declared_allergens_json ?? '[]',
    ingredientsJson: row.ingredients_json ?? '[]',
    rulesetVersion: row.ruleset_version ?? undefined,
    offUrl: row.off_url ?? undefined,
    vegMark: (row.veg_mark as HistoryScan['vegMark']) || 'unknown',
    source: (row.source as HistoryScan['source']) || 'manual',
    createdAt: row.created_at,
    insufficientData: row.insufficient_data === 1,
    // A row written before coverage existed, or one carrying a value this build
    // does not recognise, is treated as unverified. Defaulting to 'verified'
    // would re-introduce the exact false SAFE this feature removes.
    ...(row.coverage && COVERAGE_VALUES.has(row.coverage as Coverage)
      ? { coverage: row.coverage as Coverage }
      : { coverage: 'unverified' as Coverage }),
    ...(row.ai_provenance_json
      ? { aiProvenance: parseJson<AiProvenance | null>(row.ai_provenance_json, null) ?? undefined }
      : {}),
  };
}

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Reads one page of history. The flags/ingredients columns hold JSON blobs, so
 * loading every row on mount made startup cost grow without bound; the list is
 * paginated and older pages are fetched on demand.
 */
export function getScansPage(
  limit: number = DEFAULT_PAGE_SIZE,
  offset: number = 0
): HistoryScan[] {
  const rows = getDb().getAllSync<DbScanRow>(
    'SELECT * FROM scans ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
    limit,
    offset
  );
  return rows.map(mapRowToHistoryScan);
}

export function countScans(): number {
  return getDb().getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM scans')?.count ?? 0;
}

export function getScanById(id: number): HistoryScan | null {
  const row = getDb().getFirstSync<DbScanRow>('SELECT * FROM scans WHERE id = ?', id);
  return row ? mapRowToHistoryScan(row) : null;
}

export function deleteScan(id: number): void {
  const scan = getScanById(id);
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM scans WHERE id = ?', id);
  });
  deleteScanImage(scan?.imageUri);
}

export function clearHistory(): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM scans');
  });
  deleteAllScanImages();
}

export function isVerdict(value: string): value is Verdict {
  return value === 'safe' || value === 'caution' || value === 'unsafe';
}
