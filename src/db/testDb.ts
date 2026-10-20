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

type TestDb = BetterSQLite3Database<typeof schema>;
type ItemSeed = typeof schema.items.$inferInsert & { stockCount?: number };

/**
 * Inserts items the way fixtures used to with the old `items.stockCount`
 * column: each row gets `stockCount` (default 1) blank active units, since
 * stock is now derived from units. Returns the inserted item rows.
 */
export async function insertItems(db: TestDb, seeds: ItemSeed | ItemSeed[]) {
  const list = Array.isArray(seeds) ? seeds : [seeds];
  const rows = [];
  for (const { stockCount = 1, ...item } of list) {
    const [row] = await db.insert(schema.items).values(item).returning();
    if (stockCount > 0) {
      await db.insert(schema.units).values(Array.from({ length: stockCount }, () => ({ itemId: row.id })));
    }
    rows.push(row);
  }
  return rows;
}
