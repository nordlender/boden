// Shared in-memory sqlite for lib tests that exercise real drizzle/
// better-sqlite3 behavior (schema applied via the real migrations, same as
// production) without touching ./data/rental.db. Each test file still needs
// its own `vi.mock('../../db/client', ...)` call (vi.mock is hoisted per
// file), pointed at `mockedDbClient` below.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../db/schema';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

let current: BetterSQLite3Database<typeof schema>;

export function freshDb(): BetterSQLite3Database<typeof schema> {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const database = drizzle(sqlite, { schema });
	migrate(database, { migrationsFolder });
	current = database;
	return database;
}

export const mockedDbClient = {
	get db() {
		return current;
	},
};
