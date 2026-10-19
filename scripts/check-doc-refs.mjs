#!/usr/bin/env node
// Fails if a doc points at something that no longer exists: a markdown link
// target, a backticked repo path (`src/...`, `docs/...`, `scripts/...`), or an
// `npm run <script>` that isn't in package.json. Catches renamed/deleted files
// leaving dead references behind (e.g. a doc still citing a deleted page).
//
// Backticked paths containing `*` or `…` are treated as patterns and skipped.
//
// Usage: node scripts/check-doc-refs.mjs   (npm run docs:check)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgScripts = new Set(Object.keys(JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')).scripts));

const files = [
  'README.md',
  'AGENTS.md',
  'scripts/README.md',
  ...readdirSync(path.join(rootDir, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`),
].filter((f) => existsSync(path.join(rootDir, f)));

const PATH_PREFIX = /^(src|docs|scripts|public|\.github)\//;
const ROOT_FILES = new Set(['README.md', 'AGENTS.md', 'package.json', 'drizzle.config.ts', 'astro.config.mjs', '.env.example']);

const problems = [];
const report = (file, line, msg) => problems.push(`${file}:${line}: ${msg}`);

for (const file of files) {
  const lines = readFileSync(path.join(rootDir, file), 'utf8').split('\n');
  let inFence = false;
  lines.forEach((text, i) => {
    const line = i + 1;
    if (text.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    // Code blocks are examples (often abridged or illustrative), not claims.
    if (inFence) return;

    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const clean = target.split('#')[0];
      if (clean && !existsSync(path.resolve(rootDir, path.dirname(file), clean))) {
        report(file, line, `broken link target ${target}`);
      }
    }

    for (const [, token] of text.matchAll(/`([^`]+)`/g)) {
      if (/[*…\s]/.test(token)) continue;
      // "src/foo.ts:12" and "src/dir/" forms.
      const candidate = token.replace(/:\d+(-\d+)?$/, '').replace(/\/$/, '');
      if (PATH_PREFIX.test(candidate) || ROOT_FILES.has(candidate)) {
        if (!existsSync(path.join(rootDir, candidate))) report(file, line, `missing path ${token}`);
      }
    }

    for (const [, name] of text.matchAll(/npm run (?:--[\w-]+ )*([\w:-]+)/g)) {
      if (!pkgScripts.has(name)) report(file, line, `unknown npm script "${name}"`);
    }
  });
}

if (problems.length > 0) {
  console.error(`${problems.length} stale doc reference(s):\n`);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} docs: all references resolve.`);
