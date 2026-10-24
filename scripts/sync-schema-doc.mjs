#!/usr/bin/env node
// Keeps the embedded schema block in docs/schema.md identical to
// src/db/schema.ts, so the doc can't drift from the real schema.
//
// Usage:
//   node scripts/sync-schema-doc.mjs          rewrite the block in docs/schema.md
//   node scripts/sync-schema-doc.mjs --check  exit 1 if the block is out of date (CI)

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(rootDir, 'src', 'db', 'schema.ts');
const docPath = path.join(rootDir, 'docs', 'schema.md');

const START = '<!-- schema:start (generated from src/db/schema.ts by scripts/sync-schema-doc.mjs — do not edit by hand) -->';
const END = '<!-- schema:end -->';

const schema = readFileSync(schemaPath, 'utf8').trimEnd();
const doc = readFileSync(docPath, 'utf8');

const start = doc.indexOf(START);
const end = doc.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error(`docs/schema.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}

const block = `${START}\n\`\`\`ts\n${schema}\n\`\`\`\n${END}`;
const next = doc.slice(0, start) + block + doc.slice(end + END.length);

if (process.argv.includes('--check')) {
  if (next !== doc) {
    console.error('docs/schema.md is out of date with src/db/schema.ts — run `npm run docs:schema`.');
    process.exit(1);
  }
  process.exit(0);
}

if (next !== doc) writeFileSync(docPath, next);
console.log(next === doc ? 'docs/schema.md already up to date.' : 'docs/schema.md updated.');
