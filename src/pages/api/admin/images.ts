export const prerender = false;

// Image upload for the wizard's image menu (ImageMenu.astro). Called via
// fetch() with a multipart body (`file`), answers JSON. Also gated by
// src/middleware/prefixes.ts's ROUTE_RULES — defense-in-depth, keep
// this inline check too.

import type { APIRoute } from 'astro';
import { MAX_UPLOAD_BYTES, saveImageUpload } from '../../../lib/uploads';
import { requireAdmin } from '../../../lib/http';

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
	const forbidden = requireAdmin(locals);
	if (forbidden) return forbidden;

	// Reject an oversized body before buffering it (the multipart framing
	// adds a little on top of the file itself).
	const declaredLength = Number(request.headers.get('content-length'));
	if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: 'too_large' }, 413);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'invalid_body' }, 400);
	}

	const file = form.get('file');
	if (!(file instanceof File)) return json({ error: 'missing_file' }, 400);

	const result = await saveImageUpload(file);
	if (!result.ok) return json({ error: result.error }, result.error === 'too_large' ? 413 : 400);

	return json({ url: result.url, name: result.name }, 201);
};
