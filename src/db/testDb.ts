import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/**
 * Builds a fresh, migrated in-memory sqlite db for tests, so specs that
 * mock `../../db/client` don't each open production's `./data/rental.db`.
 * Not for app code — only ever imported from `vi.mock('../../db/client', ...)` factories.
 */
export function createTestDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './src/db/migrations' });
  return db;
}
