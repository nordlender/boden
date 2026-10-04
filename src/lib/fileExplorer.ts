// Builds (and incrementally lists) a read-only directory tree for
// <FileExplorer>. `root` is meant to be a constant the caller hardcodes
// (e.g. PUBLIC_ROOT below) — never a value derived from request input, so
// there is nothing for a client to redirect via path traversal there.
// listChildren()'s `subPath`, in contrast, IS client input (the lazy-load
// API route's `?path=`), so it gets its own traversal + symlink guard
// before ever reaching the filesystem — see there for details.
import { mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { MEDIA_URL_PREFIX, UPLOAD_DIR } from './uploads';

export interface FileNode {
	name: string;
	// Relative to root, POSIX-style ('/' separators) regardless of platform.
	path: string;
	type: 'file' | 'directory';
	// Directories only: whether they contain at least one public entry.
	// Actual children are loaded lazily (see listChildren) rather than read
	// up front — a directory tree can be arbitrarily large, and nothing
	// here should have to walk more of it than what's actually expanded on
	// screen.
	hasChildren?: boolean;
}

export const PUBLIC_ROOT = join(process.cwd(), 'public');

// Lists only files a browser can show as an image. SVG is listed (the
// site's own public/ assets include SVGs) even though it isn't accepted as
// an upload — see uploads.ts.
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

export interface FileFilter {
	imagesOnly?: boolean;
}

// The directories a <FileExplorer> may browse, by key. The lazy-load API
// route takes one of these keys (never a path), so a client can't point it
// at any other directory. urlPrefix maps a file's root-relative path to the
// URL it's served at.
export const FILE_ROOTS = {
	public: { dir: PUBLIC_ROOT, urlPrefix: '/', filter: {} },
	'site-images': { dir: PUBLIC_ROOT, urlPrefix: '/', filter: { imagesOnly: true } },
	uploads: { dir: UPLOAD_DIR, urlPrefix: MEDIA_URL_PREFIX, filter: { imagesOnly: true } },
} satisfies Record<string, { dir: string; urlPrefix: string; filter: FileFilter }>;

export type FileRootKey = keyof typeof FILE_ROOTS;

export function isFileRootKey(value: string): value is FileRootKey {
	return Object.hasOwn(FILE_ROOTS, value);
}

// Resolves a root key, creating the directory if needed — data/uploads
// doesn't exist until the first upload.
export function getFileRoot(key: FileRootKey): { dir: string; urlPrefix: string; filter: FileFilter } {
	const root = FILE_ROOTS[key];
	mkdirSync(root.dir, { recursive: true });
	return root;
}

/** The URL a file in a root is served at. */
export function fileUrl(key: FileRootKey, path: string): string {
	return FILE_ROOTS[key].urlPrefix + path.split('/').map(encodeURIComponent).join('/');
}

// "Public" excludes dotfiles/dotdirs (.git, .env, .DS_Store, etc.) — the
// filesystem's own convention for "not meant to be browsed".
function isPublicName(name: string): boolean {
	return !name.startsWith('.');
}

function hasPublicEntry(dir: string): boolean {
	try {
		return readdirSync(dir, { withFileTypes: true }).some((entry) => isPublicName(entry.name));
	} catch {
		return false; // permission error, or deleted mid-read
	}
}

// Lists one directory's immediate public children — never recurses into
// subdirectories, since that's exactly what made the old buildFileTree walk
// (and serialize into HTML) the entire tree on every request, regardless of
// what was actually expanded on screen.
function readPublicLevel(dir: string, realRoot: string, filter: FileFilter): FileNode[] {
	const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => isPublicName(entry.name));
	const nodes: FileNode[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		let real: string;
		try {
			// realpathSync follows symlinks, so this also gives the true type
			// for a symlinked entry (Dirent.isDirectory()/isFile() only reflect
			// the symlink itself, not its target).
			real = realpathSync(fullPath);
		} catch {
			continue; // broken symlink, permission error, or deleted mid-read
		}

		// Reject anything (symlink or otherwise) that resolves outside the
		// fixed root, so a symlink inside root can't be used to escape it.
		if (real !== realRoot && !real.startsWith(realRoot + sep)) continue;

		const stats = statSync(real);
		const relPath = relative(realRoot, real).split(sep).join('/');

		if (stats.isDirectory()) {
			nodes.push({ name: entry.name, path: relPath, type: 'directory', hasChildren: hasPublicEntry(real) });
		} else if (stats.isFile() && (!filter.imagesOnly || IMAGE_FILE_PATTERN.test(entry.name))) {
			nodes.push({ name: entry.name, path: relPath, type: 'file' });
		}
		// Anything else (socket, fifo, device) is silently skipped.
	}

	nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
	return nodes;
}

// Returns just the top level; each directory's own children are fetched on
// demand via listChildren() when it's actually expanded.
export function buildFileTree(root: string, filter: FileFilter = {}): FileNode[] {
	const realRoot = realpathSync(root);
	return readPublicLevel(realRoot, realRoot, filter);
}

// Resolves `subPath` (relative, '/'-separated, as produced in FileNode.path)
// against `root` and lists that directory's immediate public children.
// Backs the lazy-load API route — every segment is checked before it
// reaches the filesystem (no '..', no absolute-looking segment survives the
// join), and the resolved path gets the same containment check every entry
// in readPublicLevel goes through, so a symlink can't be used to escape
// root here either. Throws on anything invalid; callers turn that into a
// 404 rather than leaking why.
export function listChildren(root: string, subPath: string, filter: FileFilter = {}): FileNode[] {
	const realRoot = realpathSync(root);
	const segments = subPath.split('/').filter(Boolean);
	if (segments.some((segment) => segment === '.' || segment === '..')) {
		throw new Error('Invalid path');
	}

	const target = join(realRoot, ...segments);
	let real: string;
	try {
		real = realpathSync(target);
	} catch {
		throw new Error('Invalid path');
	}
	if ((real !== realRoot && !real.startsWith(realRoot + sep)) || !statSync(real).isDirectory()) {
		throw new Error('Invalid path');
	}

	return readPublicLevel(real, realRoot, filter);
}
