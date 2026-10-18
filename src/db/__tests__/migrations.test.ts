import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../schema';

// Smoke test: the baseline migration under src/db/migrations should apply
// cleanly to a brand-new sqlite file and produce every table declared in
// src/db/schema.ts. This guards against the exact hazard this migration
// history was cleaned up to avoid — a baseline that doesn't actually apply,
// or drifts from the schema it's supposed to represent.
describe('db migrations', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('applies cleanly to a fresh db and creates every schema table', () => {
    dir = mkdtempSync(join(tmpdir(), 'rental-migrations-test-'));
    const dbPath = join(dir, 'test.db');
    const sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: './src/db/migrations' });

    const tables = sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name);

    // Derived from the schema's own table exports, so a new table can't be
    // forgotten here.
    const expected = (Object.values(schema) as unknown[])
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .map((table) => getTableConfig(table).name);
    expect(expected).toContain('units');
    expect(tables).toEqual(expect.arrayContaining(expected));

    sqlite.close();
  });
});
