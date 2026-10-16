#!/usr/bin/env node
// Dev-only, run by dev-setup.sh before `drizzle-kit migrate`: detects a local
// db that was migrated before the current migration baseline was cut (see the
// database-and-drizzle-cleanup skill's "baseline update"). drizzle-kit would
// otherwise try to apply the whole baseline on top of it and fail with
// "table already exists". Such a db is moved — not deleted — to
// data/backups/stale-<timestamp>/, so dev-setup can build a fresh one.
//
// Usage: node scripts/check-db-baseline.mjs

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Must match drizzle.config.ts's dbCredentials.url and out.
const dbPath = path.join(rootDir, 'data', 'rental.db');
const journalPath = path.join(rootDir, 'src', 'db', 'migrations', 'meta', '_journal.json');

if (!existsSync(dbPath)) process.exit(0);

const baseline = JSON.parse(readFileSync(journalPath, 'utf8')).entries[0];
const db = new Database(dbPath, { readonly: true });
const hasMigrationsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").get();
const applied = hasMigrationsTable ? db.prepare('SELECT created_at FROM __drizzle_migrations').all().map((row) => Number(row.created_at)) : [];
db.close();

// A db with nothing applied yet is fine (migrate builds it), and so is one
// that already has the current baseline. Anything else predates it.
if (applied.length === 0 || applied.includes(baseline.when)) process.exit(0);

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const backupDir = path.join(rootDir, 'data', 'backups', `stale-${stamp}`);
mkdirSync(backupDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(dbPath + suffix)) renameSync(dbPath + suffix, path.join(backupDir, `rental.db${suffix}`));
}
console.log(
  `data/rental.db was migrated before the current baseline (${baseline.tag}) and can't be upgraded in place.\n` +
    `Moved it to ${path.relative(rootDir, backupDir)}/ — a fresh db will be created and seeded.`,
);
