#!/usr/bin/env node
// Dev-only: seeds pickup_available_days with every Monday for the next
// WEEKS_AHEAD weeks, so the /reservation calendar has some pick-up days
// available to test against instead of showing none.
//
// Not wired into astro dev/build/preview. Run manually after
// `npx drizzle-kit migrate` (or via `npm run dev-setup`, which calls this).
//
// Idempotent: uses INSERT OR IGNORE on the date primary key, so re-running
// never overwrites a date an admin has since removed via /admin/pickup-days.
//
// Usage: node scripts/seed-pickup-days.mjs

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Must match drizzle.config.ts's dbCredentials.url.
const dbPath = path.join(rootDir, 'data', 'rental.db');

if (!existsSync(dbPath)) {
  console.error(`No db found at ${dbPath}. Run \`npx drizzle-kit migrate\` first.`);
  process.exit(1);
}

const WEEKS_AHEAD = 12;

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function nextMonday(from) {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  // getUTCDay(): 0 = Sunday .. 1 = Monday .. 6 = Saturday.
  if (date.getUTCDay() !== 1) {
    const daysUntilMonday = ((1 - date.getUTCDay()) + 7) % 7;
    date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  }
  return date;
}

const mondays = [];
let monday = nextMonday(new Date());
for (let i = 0; i < WEEKS_AHEAD; i++) {
  mondays.push(toDateString(monday));
  monday = new Date(monday);
  monday.setUTCDate(monday.getUTCDate() + 7);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const insert = db.prepare('INSERT OR IGNORE INTO pickup_available_days (date) VALUES (?)');

const seed = db.transaction((dates) => {
  for (const date of dates) insert.run(date);
});

seed(mondays);
db.close();

console.log(`Seeded ${mondays.length} Mondays as available pick-up days (${mondays[0]}..${mondays[mondays.length - 1]}).`);
