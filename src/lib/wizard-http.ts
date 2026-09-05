// Shared helpers for src/pages/api/wizard/*.ts route handlers: the admin
// role-gate and the post-submit redirect target, both previously duplicated
// verbatim in every wizard API route.

import type { APIContext } from 'astro';

/**
 * True for a strictly-positive integer. Use this — not bare
 * `Number.isInteger` — when validating an id parsed with `Number(...)` from
 * form data: `Number(null)` and `Number('')` (a missing field, or a <select>'s
 * disabled empty option) both coerce to `0`, which `Number.isInteger` alone
 * would wrongly accept even though `0` is never a valid row id.
 */
export function isPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
}

/**
 * Returns a 403 Response if the current request isn't from an admin, or
 * `null` if the caller may proceed.
 */
export function requireAdmin(locals: APIContext['locals']): Response | null {
	if (locals.user?.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}
	return null;
}

/**
 * Picks a safe post-submit redirect target out of a form's `redirectTo`
 * field, falling back to `/admin/items` for anything that isn't a same-origin
 * path.
 *
 * `redirectTo.startsWith('/')` alone is not enough: browsers resolve a
 * protocol-relative URL like `//evil.com/x` in a `Location` header as
 * `https://evil.com/x`, so a bare "starts with /" check lets an attacker send
 * an admin's browser off-site after a wizard action. Resolving against the
 * request's own origin and comparing origins closes that hole.
 */
export function safeRedirectTarget(form: FormData, origin: string): string {
	const fallback = '/admin/items';
	const redirectTo = form.get('redirectTo');
	// Require a path (leading "/"), same as before — this alone still lets a
	// protocol-relative URL like "//evil.com/x" through, since it also starts
	// with "/". The origin check below closes that gap.
	if (typeof redirectTo !== 'string' || !redirectTo.startsWith('/')) return fallback;

	let resolved: URL;
	try {
		resolved = new URL(redirectTo, origin);
	} catch {
		return fallback;
	}

	if (resolved.origin !== origin) return fallback;

	return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
