export const prerender = false;

// TODO: no auth check yet — src/middleware doesn't exist in this branch and
// locals.user is never populated. See the api-test worktree's src/middleware
// /index.ts + src/lib/auth.ts for the intended admin-role gate once that
// lands; these wizard routes are unprotected until then.

import type { APIRoute } from 'astro';
import { createItem } from '../../../lib/wizard';

function redirectTarget(form: FormData): string {
	const redirectTo = form.get('redirectTo');
	return typeof redirectTo === 'string' && redirectTo.startsWith('/') ? redirectTo : '/admin/items';
}

export const POST: APIRoute = async ({ request, redirect }) => {
	const form = await request.formData();
	const name = form.get('name')?.toString().trim();
	const imageUrl = form.get('imageUrl')?.toString().trim() || null;

	if (!name) {
		return new Response('Item name is required', { status: 400 });
	}

	await createItem({ name, imageUrl });
	return redirect(redirectTarget(form));
};
