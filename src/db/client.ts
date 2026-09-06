import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const DB_PATH = './data/rental.db';
// `data/` is gitignored, so a fresh checkout (a new worktree, CI) never has
// it — better-sqlite3 fails with "Cannot open database because the
// directory does not exist" instead of creating one.
mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
