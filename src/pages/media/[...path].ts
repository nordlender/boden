export const prerender = false;

// Serves admin-uploaded images from data/uploads (see src/lib/uploads.ts
// for why they don't live in public/). Public, like everything in public/:
// item images are shown in the shop.

import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { UPLOAD_DIR, contentTypeForUpload } from '../../lib/uploads';

export const GET: APIRoute = async ({ params }) => {
	const name = params.path ?? '';
	const contentType = contentTypeForUpload(name);
	// Uploads are stored flat, so anything with a directory part is invalid.
	if (!contentType || name.includes('/') || name.includes('\\') || name.startsWith('.')) {
		return new Response(null, { status: 404 });
	}

	let body: Buffer;
	try {
		const realRoot = realpathSync(UPLOAD_DIR);
		const real = realpathSync(join(realRoot, name));
		if (!real.startsWith(realRoot + sep)) return new Response(null, { status: 404 });
		body = await readFile(real);
	} catch {
		return new Response(null, { status: 404 });
	}

	return new Response(new Uint8Array(body), {
		headers: {
			'Content-Type': contentType,
			'X-Content-Type-Options': 'nosniff',
			// Filenames carry a random suffix and are never overwritten.
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};
