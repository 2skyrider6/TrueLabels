export interface Migration {
  version: number;
  sql: string;
}

/**
 * Migrations are applied in order and tracked with SQLite's `user_version`, so
 * they run exactly once per install. `CREATE TABLE IF NOT EXISTS` alone is not
 * enough: a new release that adds a column would silently leave existing installs
 * with the old shape, and every query for that column would then fail at runtime.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT,
        product_name TEXT,
        image_uri TEXT,
        raw_text TEXT,
        verdict TEXT,
        flags_json TEXT,
        may_contain_json TEXT,
        veg_mark TEXT,
        source TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
    `,
  },
  {
    // Everything needed to faithfully restore a scan, rather than a partial
    // summary that loses the brand, the source link and the parsed ingredient list.
    version: 2,
    sql: `
      ALTER TABLE scans ADD COLUMN brands TEXT;
      ALTER TABLE scans ADD COLUMN off_url TEXT;
      ALTER TABLE scans ADD COLUMN ruleset_version TEXT;
      ALTER TABLE scans ADD COLUMN ingredients_json TEXT;
      ALTER TABLE scans ADD COLUMN declared_allergens_json TEXT;
    `,
  },
  {
    // An unreadable label must stay unreadable after a restart, otherwise history
    // silently re-presents it as an ordinary result.
    version: 3,
    sql: `
      ALTER TABLE scans ADD COLUMN insufficient_data INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    // Coverage and provenance for the on-device rules engine.
    //
    // `coverage` gates what the result screen may display: an 'unverified' row must
    // never be re-rendered as a trusted SAFE verdict when reopened from history.
    // This is the part that matters for safety, because history is where someone
    // looks up a product they bought weeks ago.
    //
    // It is nullable with an explicit backfill rather than a DEFAULT of
    // 'verified', because a column default would assert a trust level for every
    // pre-existing row that was never actually established. The backfill
    // reproduces exactly what the app did before, which is to trust a verdict
    // when the label was readable and refuse it when it was not.
    version: 4,
    sql: `
      ALTER TABLE scans ADD COLUMN coverage TEXT;
      ALTER TABLE scans ADD COLUMN ai_provenance_json TEXT;

      UPDATE scans
      SET coverage = CASE WHEN insufficient_data = 1 THEN 'unverified' ELSE 'verified' END;

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
