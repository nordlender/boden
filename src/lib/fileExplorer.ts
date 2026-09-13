// Builds a read-only directory tree for <FileExplorer>. The caller's `root`
// is the only path that ever reaches the filesystem from outside this
// module — there is no per-request "which directory" input (no query param,
// no form field), so there is nothing here for a client to redirect via
// path traversal. The remaining risk is a symlink *inside* root pointing
// somewhere else on disk, which is guarded against below.
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface FileNode {
	name: string;
	// Relative to root, POSIX-style ('/' separators) regardless of platform.
	path: string;
	type: 'file' | 'directory';
	children?: FileNode[];
}

// "Public" excludes dotfiles/dotdirs (.git, .env, .DS_Store, etc.) — the
// filesystem's own convention for "not meant to be browsed".
function isPublicName(name: string): boolean {
	return !name.startsWith('.');
}

function readPublicTree(dir: string, realRoot: string): FileNode[] {
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
			nodes.push({ name: entry.name, path: relPath, type: 'directory', children: readPublicTree(fullPath, realRoot) });
		} else if (stats.isFile()) {
			nodes.push({ name: entry.name, path: relPath, type: 'file' });
		}
		// Anything else (socket, fifo, device) is silently skipped.
	}

	nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
	return nodes;
}

// `root` is meant to be a constant the calling component hardcodes (e.g. an
// absolute path under `public/`) — never a value derived from request
// input. Resolving it through realpathSync up front means every
// containment check below compares against the same canonical path even if
// root itself is (or contains a component that is) a symlink.
export function buildFileTree(root: string): FileNode[] {
	const realRoot = realpathSync(root);
	return readPublicTree(realRoot, realRoot);
}
