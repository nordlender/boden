import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFileTree, listChildren } from '../fileExplorer';

describe('buildFileTree', () => {
  let root: string;
  let outsideRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'file-explorer-root-'));
    outsideRoot = mkdtempSync(join(tmpdir(), 'file-explorer-outside-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  });

  it('lists files and directories, directories first then alphabetically', () => {
    writeFileSync(join(root, 'b.txt'), '');
    writeFileSync(join(root, 'a.txt'), '');
    mkdirSync(join(root, 'zeta'));
    mkdirSync(join(root, 'alpha'));

    const tree = buildFileTree(root);

    expect(tree.map((n) => [n.name, n.type])).toEqual([
      ['alpha', 'directory'],
      ['zeta', 'directory'],
      ['a.txt', 'file'],
      ['b.txt', 'file'],
    ]);
  });

  it('lists only the top level, flagging directories with public children via hasChildren', () => {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'nested.txt'), '');
    mkdirSync(join(root, 'empty-dir'));

    const tree = buildFileTree(root);

    expect(tree).toEqual([
      { name: 'empty-dir', path: 'empty-dir', type: 'directory', hasChildren: false },
      { name: 'sub', path: 'sub', type: 'directory', hasChildren: true },
    ]);
  });

  it('excludes dotfiles and dotdirs ("public" items only)', () => {
    writeFileSync(join(root, '.env'), 'SECRET=1');
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git', 'config'), '');
    writeFileSync(join(root, 'visible.txt'), '');

    const tree = buildFileTree(root);

    expect(tree).toEqual([{ name: 'visible.txt', path: 'visible.txt', type: 'file' }]);
  });

  it('drops a symlink that resolves outside the fixed root', () => {
    writeFileSync(join(outsideRoot, 'secret.txt'), 'nope');
    symlinkSync(join(outsideRoot, 'secret.txt'), join(root, 'escape.txt'));

    const tree = buildFileTree(root);

    expect(tree).toEqual([]);
  });

  it('drops a symlinked directory that resolves outside the fixed root', () => {
    symlinkSync(outsideRoot, join(root, 'escape-dir'), 'dir');

    const tree = buildFileTree(root);

    expect(tree).toEqual([]);
  });

  it('follows a symlink that stays inside the fixed root', () => {
    mkdirSync(join(root, 'real'));
    writeFileSync(join(root, 'real', 'file.txt'), 'ok');
    symlinkSync(join(root, 'real', 'file.txt'), join(root, 'link.txt'));

    const tree = buildFileTree(root);
    const link = tree.find((n) => n.name === 'link.txt');

    expect(link).toEqual({ name: 'link.txt', path: 'real/file.txt', type: 'file' });
  });

  it('returns an empty array for an empty directory', () => {
    expect(buildFileTree(root)).toEqual([]);
  });
});

describe('listChildren', () => {
  let root: string;
  let outsideRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'file-explorer-root-'));
    outsideRoot = mkdtempSync(join(tmpdir(), 'file-explorer-outside-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  });

  it("lists a subdirectory's immediate children, relative to root", () => {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'nested.txt'), '');
    mkdirSync(join(root, 'sub', 'deeper'));
    writeFileSync(join(root, 'sub', 'deeper', 'ignored.txt'), '');

    expect(listChildren(root, 'sub')).toEqual([
      { name: 'deeper', path: 'sub/deeper', type: 'directory', hasChildren: true },
      { name: 'nested.txt', path: 'sub/nested.txt', type: 'file' },
    ]);
  });

  it('rejects a path containing a ".." segment', () => {
    mkdirSync(join(root, 'sub'));

    expect(() => listChildren(root, 'sub/../..')).toThrow();
  });

  it('rejects a subPath that resolves outside root via a symlink', () => {
    symlinkSync(outsideRoot, join(root, 'escape-dir'), 'dir');

    expect(() => listChildren(root, 'escape-dir')).toThrow();
  });

  it('rejects a subPath that points at a file, not a directory', () => {
    writeFileSync(join(root, 'a.txt'), '');

    expect(() => listChildren(root, 'a.txt')).toThrow();
  });

  it('rejects a subPath that does not exist', () => {
    expect(() => listChildren(root, 'nope')).toThrow();
  });

  it('lists the root itself for an empty subPath', () => {
    writeFileSync(join(root, 'a.txt'), '');

    expect(listChildren(root, '')).toEqual([{ name: 'a.txt', path: 'a.txt', type: 'file' }]);
  });
});
