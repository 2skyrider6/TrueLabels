import * as SQLite from 'expo-sqlite';
import { getDatabase } from './history';

/**
 * Small key/value store for app-level state that is not a scan.
 *
 * Currently one key: the opaque install id used for server-side rate limiting.
 * It lives in SQLite rather than AsyncStorage because that is the only durable
 * storage the app already depends on, and adding a second persistence layer for
 * a single 36-character string would be disproportionate.
 */

export function getMeta(key: string): string | null {
  const row = getDatabase().getFirstSync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDatabase().runSync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

export type { SQLite };
