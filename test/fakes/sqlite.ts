/**
 * An in-memory stand-in for `expo-sqlite`, limited to the statements
 * `src/db/history.ts` issues.
 *
 * The point is not to be SQLite. It is to let the repository layer be tested at
 * all: migrations, parameter binding, ordering, pagination and the
 * `insufficient_data` round trip are where a bug would silently turn an unreadable
 * label into a clean green result after a restart.
 *
 * Every statement is recorded, so a test can assert that migrations ran exactly
 * once and in order.
 */

export interface FakeRow {
  [column: string]: string | number | null;
}

interface FakeTable {
  /** Column names in declaration order, from CREATE TABLE plus any ALTERs. */
  columns: string[];
  rows: FakeRow[];
  /** Auto-increment counter for the INTEGER PRIMARY KEY. */
  nextId: number;
}

export class FakeSqliteDatabase {
  readonly statements: { sql: string; params: unknown[] }[] = [];
  /** When set, the next statement throws it and then clears itself. */
  failNextWith: Error | null = null;
  /** When set, every statement throws, for testing a permanently broken store. */
  failAlwaysWith: Error | null = null;

  private userVersion = 0;
  private tables = new Map<string, FakeTable>();

  // -------------------------------------------------------------------------
  // The API surface src/db/history.ts uses
  // -------------------------------------------------------------------------

  execSync(sql: string): void {
    this.guard(sql);
    // A migration is applied as one multi-statement string, so it is split here
    // the way SQLite would execute it: statement by statement, in order.
    for (const statement of splitStatements(sql)) {
      this.statements.push({ sql: statement, params: [] });
      this.applyDdl(statement);
    }
  }

  runSync(sql: string, ...params: unknown[]): { lastInsertRowId: number } {
    this.guard(sql);
    this.statements.push({ sql, params });

    const deleteAll = /^DELETE FROM (\w+)$/i.exec(sql);
    if (deleteAll) {
      this.table(deleteAll[1]).rows = [];
      return { lastInsertRowId: 0 };
    }

    const deleteById = /^DELETE FROM (\w+) WHERE id = \?$/i.exec(sql);
    if (deleteById) {
      const table = this.table(deleteById[1]);
      table.rows = table.rows.filter(row => row.id !== params[0]);
      return { lastInsertRowId: 0 };
    }

    const insert = /^INSERT INTO (\w+)\s*\(([\s\S]*?)\)\s*VALUES/i.exec(sql);
    if (!insert) throw new Error(`FakeSqliteDatabase: unsupported statement: ${sql}`);

    const table = this.table(insert[1]);
    const columns = insert[2].split(',').map(column => column.trim());

    // A column/param mismatch in the INSERT is exactly the bug that would write
    // an allergen list into the ruleset column, so the fake refuses it loudly
    // rather than silently padding.
    if (params.length !== columns.length) {
      throw new Error(
        `FakeSqliteDatabase: INSERT into ${insert[1]} binds ${params.length} values to ${columns.length} columns`
      );
    }

    const row: FakeRow = { id: table.nextId };
    columns.forEach((column, i) => {
      row[column] = params[i] as FakeRow[string];
    });
    table.rows.push(row);
    table.nextId += 1;
    return { lastInsertRowId: row.id as number };
  }

  getAllSync<T>(sql: string, ...params: unknown[]): T[] {
    this.guard(sql);
    this.statements.push({ sql, params });

    const paged =
      /^SELECT \* FROM (\w+) ORDER BY created_at DESC, id DESC LIMIT \? OFFSET \?/i.exec(sql);
    if (paged) {
      const [limit, offset] = params.map(Number);
      return this.orderedRows(paged[1]).slice(offset, offset + limit) as unknown as T[];
    }

    throw new Error(`FakeSqliteDatabase: unsupported statement: ${sql}`);
  }

  getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
    this.guard(sql);
    this.statements.push({ sql, params });

    const trimmed = sql.trim();

    if (/^PRAGMA user_version$/i.test(trimmed)) {
      return { user_version: this.userVersion } as unknown as T;
    }

    const count = /SELECT COUNT\(\*\) as count FROM (\w+)/i.exec(sql);
    if (count) return { count: this.table(count[1]).rows.length } as unknown as T;

    const byId = /^SELECT \* FROM (\w+) WHERE id = \?$/i.exec(sql);
    if (byId) {
      const row = this.table(byId[1]).rows.find(candidate => candidate.id === params[0]);
      return (row as unknown as T) ?? null;
    }

    throw new Error(`FakeSqliteDatabase: unsupported statement: ${sql}`);
  }

  withTransactionSync(fn: () => void): void {
    // No rollback is modelled. Every statement here is synchronous and applied
    // independently, which is enough to exercise migration ordering and the
    // delete paths without pretending to be a storage engine.
    fn();
  }

  // -------------------------------------------------------------------------
  // Introspection for tests
  // -------------------------------------------------------------------------

  rows(table: string): FakeRow[] {
    return this.table(table).rows;
  }

  columns(table: string): string[] {
    return this.table(table).columns;
  }

  version(): number {
    return this.userVersion;
  }

  countOf(sqlMatches: (sql: string) => boolean): number {
    return this.statements.filter(s => sqlMatches(s.sql)).length;
  }

  /** Empties every table but keeps the schema and the stored user_version. */
  clearAllRows(): void {
    for (const table of this.tables.values()) table.rows = [];
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private guard(sql: string): void {
    if (this.failAlwaysWith) throw this.failAlwaysWith;
    if (this.failNextWith) {
      const error = this.failNextWith;
      this.failNextWith = null;
      throw error;
    }
    void sql;
  }

  private orderedRows(name: string): FakeRow[] {
    return [...this.table(name).rows].sort((a, b) => {
      const byDate = String(b.created_at).localeCompare(String(a.created_at));
      // id breaks ties so two scans in the same millisecond keep a stable order.
      return byDate !== 0 ? byDate : Number(b.id) - Number(a.id);
    });
  }

  private table(name: string): FakeTable {
    const table = this.tables.get(name);
    if (!table) throw new Error(`FakeSqliteDatabase: no such table: ${name}`);
    return table;
  }

  private applyDdl(sql: string): void {
    const trimmed = sql.trim();

    const setVersion = /^PRAGMA user_version = (\d+)$/i.exec(trimmed);
    if (setVersion) {
      this.userVersion = Number(setVersion[1]);
      return;
    }

    if (/^PRAGMA journal_mode/i.test(trimmed)) return;
    if (/^CREATE INDEX/i.test(trimmed)) return;

    const create = /^CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\)\s*;?$/i.exec(trimmed);
    if (create) {
      const columns = create[2]
        .split(',')
        .map(part => part.trim().split(/\s+/)[0])
        .filter(column => column.length > 0 && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK)$/i.test(column));
      this.tables.set(create[1], { columns, rows: [], nextId: 1 });
      return;
    }

    const alter = /ALTER TABLE (\w+) ADD COLUMN (\w+)/i.exec(trimmed);
    if (alter) {
      this.table(alter[1]).columns.push(alter[2]);
      return;
    }

    // The coverage backfill in migration 4 is the only UPDATE the schema uses,
    // and it is written as a CASE expression over a flag column rather than a
    // literal assignment. The fake evaluates that one form: parsing arbitrary
    // SQL would only make the fake a second implementation of SQLite.
    const update = /^UPDATE (\w+)\s+SET\s+(\w+)\s*=\s*CASE\s+WHEN\s+(\w+)\s*=\s*(\d+)\s+THEN\s+'([^']*)'\s+ELSE\s+'([^']*)'\s+END\s*;?$/i.exec(
      trimmed
    );
    if (update) {
      const table = this.table(update[1]);
      const column = update[2];
      const flagColumn = update[3];
      const flagValue = Number(update[4]);
      const whenSet = update[5];
      const otherwiseSet = update[6];
      for (const row of table.rows) {
        row[column] = Number(row[flagColumn]) === flagValue ? whenSet : otherwiseSet;
      }
      return;
    }

    throw new Error(`FakeSqliteDatabase: unsupported DDL: ${sql}`);
  }
}

/**
 * Splits a SQL script on semicolons that are not inside a string literal or a
 * parenthesised column list. SQLite executes a multi-statement string in order,
 * so the fake has to see the same boundaries the app relies on.
 */
function splitStatements(sql: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') depth++;
    if (char === ')') depth--;

    if (char === ';' && depth === 0) {
      if (current.trim().length > 0) parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

export interface FakeSqliteHandle {
  /** The database that was opened, or undefined if it was never opened. */
  db: () => FakeSqliteDatabase;
  /** How many times the app opened the database file. */
  openCount: () => number;
  /** Names the app asked for, in order. */
  openedNames: () => string[];
  /**
   * Empties every table in every database opened so far, keeping the schema.
   *
   * The app holds its connection in a module-level variable, so re-installing the
   * mock would not open a new one. Clearing the rows is what actually gives each
   * test an empty history.
   */
  clearRows: () => void;
  /**
   * Makes the next database fail every statement, before it is opened. Used to
   * test the migration failure path, which happens on the first open.
   */
  failOnOpen: (error: Error) => void;
}

/**
 * Replaces `expo-sqlite` with the fake and clears the module registry, so
 * `src/db/history.ts` reopens the database with an empty cache.
 *
 * Must be called before the module under test is imported, which is why the
 * tests that use it load `history` dynamically inside each test.
 */
export function installFakeSqlite(): FakeSqliteHandle {
  const databases: FakeSqliteDatabase[] = [];
  const names: string[] = [];
  let openError: Error | null = null;

  jest.doMock('expo-sqlite', () => ({
    openDatabaseSync: (name: string) => {
      names.push(name);
      const database = new FakeSqliteDatabase();
      if (openError) database.failAlwaysWith = openError;
      databases.push(database);
      return database;
    },
  }));

  return {
    db: () => databases[0] as FakeSqliteDatabase,
    openCount: () => databases.length,
    openedNames: () => names,
    clearRows: () => databases.forEach(database => database.clearAllRows()),
    failOnOpen: (error: Error) => {
      openError = error;
    },
  };
}

export type HistoryModule = typeof import('../../src/db/history');

/**
 * Loads a fresh copy of the history module, so its module-level connection is
 * re-created against a new fake database.
 *
 * Used by the unit tests, which install the mock per test. Widget tests want
 * `appHistoryModule` from `environment.ts` instead, so the mounted screen and
 * the assertions share one instance and therefore one database.
 */
export function loadHistoryModule(): HistoryModule {
  let mod!: HistoryModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../../src/db/history') as HistoryModule;
  });
  return mod;
}

