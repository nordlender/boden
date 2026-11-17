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

const PATH_PREFIX = /^(src|docs|scripts|public|\.github)\//;
const ROOT_FILES = new Set(['README.md', 'AGENTS.md', 'package.json', 'drizzle.config.ts', 'astro.config.mjs', '.env.example']);

function docFiles() {
  const docs = readdirSync(path.join(rootDir, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`);
  return ['README.md', 'AGENTS.md', 'scripts/README.md', ...docs].filter((f) => existsSync(path.join(rootDir, f)));
}

// Lines outside fenced code blocks, with their 1-based line numbers. Code
// blocks are examples (often abridged or illustrative), not claims.
function proseLines(text) {
  const result = [];
  let inFence = false;
  text.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    else if (!inFence) result.push({ line, number: i + 1 });
  });
  return result;
}

function brokenLinks(line, file) {
  return [...line.matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, target]) => target)
    .filter((target) => !/^(https?:|mailto:|#)/.test(target))
    .filter((target) => {
      const clean = target.split('#')[0];
      return clean && !existsSync(path.resolve(rootDir, path.dirname(file), clean));
    })
    .map((target) => `broken link target ${target}`);
}

// Strips the "src/foo.ts:12" and "src/dir/" forms down to a plain path.
const toRepoPath = (token) => token.replace(/:\d+(-\d+)?$/, '').replace(/\/$/, '');
const looksLikeRepoPath = (p) => PATH_PREFIX.test(p) || ROOT_FILES.has(p);

function missingPaths(line) {
  return [...line.matchAll(/`([^`]+)`/g)]
    .map(([, token]) => token)
    .filter((token) => !/[*…\s]/.test(token))
    .filter((token) => looksLikeRepoPath(toRepoPath(token)) && !existsSync(path.join(rootDir, toRepoPath(token))))
    .map((token) => `missing path ${token}`);
}

function unknownScripts(line) {
  return [...line.matchAll(/npm run (?:--[\w-]+ )*([\w:-]+)/g)]
    .map(([, name]) => name)
    .filter((name) => !pkgScripts.has(name))
    .map((name) => `unknown npm script "${name}"`);
}

function checkFile(file) {
  const text = readFileSync(path.join(rootDir, file), 'utf8');
  return proseLines(text).flatMap(({ line, number }) =>
    [...brokenLinks(line, file), ...missingPaths(line), ...unknownScripts(line)].map((msg) => `${file}:${number}: ${msg}`),
  );
}

const files = docFiles();
const problems = files.flatMap(checkFile);

if (problems.length > 0) {
  console.error(`${problems.length} stale doc reference(s):\n`);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Checked ${files.length} docs: all references resolve.`);
