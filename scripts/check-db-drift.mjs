#!/usr/bin/env node
// Fails if src/db/schema.ts has changes that no committed migration covers:
// runs `drizzle-kit generate` against a scratch copy of the migrations folder
// and checks whether it wanted to emit a new migration. Nothing in the repo
// is modified.
//
// Usage: node scripts/check-db-drift.mjs   (npm run db:check)

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'db-drift-'));
const out = path.join(scratch, 'migrations');
cpSync(path.join(rootDir, 'src', 'db', 'migrations'), out, { recursive: true });
const before = new Set(readdirSync(out));

const configPath = path.join(scratch, 'drizzle.config.mjs');
writeFileSync(
  configPath,
  `export default ${JSON.stringify({
    schema: path.join(rootDir, 'src', 'db', 'schema.ts'),
    // drizzle-kit prepends "./" to `out`, so an absolute path breaks it.
    out: path.relative(rootDir, out),
    dialect: 'sqlite',
    migrations: { prefix: 'timestamp' },
  })};\n`,
);

const result = spawnSync('npx', ['drizzle-kit', 'generate', '--config', configPath, '--name', 'drift'], {
  cwd: rootDir,
  encoding: 'utf8',
  // A rename makes drizzle-kit ask "created or renamed?"; closed stdin and a
  // timeout turn that into a failure instead of a hang.
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 60_000,
});
const created = readdirSync(out).filter((f) => !before.has(f) && f.endsWith('.sql'));
const sql = created.length ? readFileSync(path.join(out, created[0]), 'utf8') : '';
rmSync(scratch, { recursive: true, force: true });

// drizzle-kit exits 0 even when it fails to read the migrations folder, so
// require one of its two explicit outcomes rather than trusting the status.
const output = `${result.stdout}\n${result.stderr}`;
const understood = /No schema changes|Your SQL migration file/.test(output);
if (result.status !== 0 || !understood) {
  console.error(output);
  process.exit(result.status || 1);
}
if (created.length > 0) {
  console.error('src/db/schema.ts has changes that no committed migration contains:\n');
  console.error(sql.trim());
  console.error('\nGenerate a migration (npx drizzle-kit generate) or, pre-v1, re-squash the baseline.');
  process.exit(1);
}
console.log('Schema and migrations agree.');
