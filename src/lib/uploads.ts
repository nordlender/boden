// Admin image uploads (the wizard's image menu, #97).
//
// Uploads live in data/uploads (gitignored and persistent, next to the
// SQLite db), not public/: in production Astro serves static files from the
// build's dist/client copy of public/, so anything written into public/ at
// runtime would 404 until the next build. They're served instead by
// src/pages/media/[...path].ts at MEDIA_URL_PREFIX.
//
// The file type is decided by sniffing the file's leading bytes, never by
// the client-sent filename or Content-Type. SVG is deliberately not
// accepted: it can carry script, and these files are served from the
// site's own origin.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
export const MEDIA_URL_PREFIX = '/media/';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const IMAGE_CONTENT_TYPES = {
	png: 'image/png',
	jpg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
} as const;

export type ImageExtension = keyof typeof IMAGE_CONTENT_TYPES;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
	return signature.every((byte, i) => bytes[offset + i] === byte);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Identifies a supported raster image from its leading bytes, or null. */
export function sniffImageType(bytes: Uint8Array): ImageExtension | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
	if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'gif';
	if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp';
	if (startsWith(bytes, ascii('ftyp'), 4) && (startsWith(bytes, ascii('avif'), 8) || startsWith(bytes, ascii('avis'), 8))) return 'avif';
	return null;
}

/**
 * A safe, unique filename for an upload: the original base name slugified
 * (falling back to "image"), a random suffix so uploads never overwrite each
 * other, and the extension of the sniffed type.
 */
export function uploadFilename(originalName: string, extension: ImageExtension): string {
	const base =
		originalName
			.replace(/\.[^.]*$/, '')
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'image';
	return `${base}-${randomBytes(3).toString('hex')}.${extension}`;
}

export type SaveUploadResult = { ok: true; url: string; name: string } | { ok: false; error: 'too_large' | 'unsupported_type' | 'empty' };

/** Validates and stores an uploaded image, returning its public URL. */
export async function saveImageUpload(file: File, dir = UPLOAD_DIR): Promise<SaveUploadResult> {
	if (file.size === 0) return { ok: false, error: 'empty' };
	if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' };

	const bytes = new Uint8Array(await file.arrayBuffer());
	const extension = sniffImageType(bytes);
	if (!extension) return { ok: false, error: 'unsupported_type' };

	const name = uploadFilename(file.name, extension);
	mkdirSync(dir, { recursive: true });
	// 'wx' fails instead of overwriting, should the random suffix ever collide.
	writeFileSync(join(dir, name), bytes, { flag: 'wx' });
	return { ok: true, url: `${MEDIA_URL_PREFIX}${name}`, name };
}

/** Content type for a served upload's filename, or null if it isn't one of ours. */
export function contentTypeForUpload(filename: string): string | null {
	const extension = filename.split('.').pop()?.toLowerCase();
	if (!extension) return null;
	return (IMAGE_CONTENT_TYPES as Record<string, string>)[extension === 'jpeg' ? 'jpg' : extension] ?? null;
}
