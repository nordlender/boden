// Shared HTTP helpers for src/pages/api/** route handlers: auth gates,
// response builders, input parsing and safe redirects.
//
// Convention:
//  - HTML <form> submissions: POST, then redirect (303 where a refresh must not
//    resubmit). Failures redirect back with `?error=<code>` (see
//    `redirectWithError`); the form's `redirectTo` field is validated with
//    `safeRedirectTarget`.
//  - fetch() callers: JSON in, JSON out (`json` / `jsonError` / `readJson`),
//    with the failure encoded in the status code and `{ error: <code> }`.
//  - Auth gates (`requireUser/requireAdmin/requireModerator`) return a Response
//    to hand straight back: 401 when anonymous, 403 when signed in without the
//    needed role. /api/* routes are not covered by the page-route middleware
//    gate, so every handler that needs auth calls one of these itself.

import type { APIContext } from 'astro';
import { isModerator } from './auth';

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
 * Returns a 401 Response if the current request isn't from a signed-in user,
 * or `null` if the caller may proceed.
 */
export function requireUser(locals: APIContext['locals']): Response | null {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	return null;
}

/**
 * Returns a 401 Response for an anonymous request, a 403 Response if the
 * user isn't an admin, or `null` if the caller may proceed.
 */
export function requireAdmin(locals: APIContext['locals']): Response | null {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (locals.user.role !== 'admin') {
		return new Response('Forbidden', { status: 403 });
	}
	return null;
}

/**
 * Returns a 401 Response for an anonymous request, a 403 Response if the
 * user isn't at least a moderator (admins included — see `isModerator`), or
 * `null` if the caller may proceed.
 */
export function requireModerator(locals: APIContext['locals']): Response | null {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	if (!isModerator(locals.user.role)) {
		return new Response('Forbidden', { status: 403 });
	}
	return null;
}

/**
 * Picks a safe post-submit redirect target out of a form's `redirectTo`
 * field, falling back to `fallback` (default `/admin/items`) for anything
 * that isn't a same-origin path.
 *
 * `redirectTo.startsWith('/')` alone is not enough: browsers resolve a
 * protocol-relative URL like `//evil.com/x` in a `Location` header as
 * `https://evil.com/x`, so a bare "starts with /" check lets an attacker send
 * an admin's browser off-site after a wizard action. Resolving against the
 * request's own origin and comparing origins closes that hole.
 *
 * `origin` is normalized via `new URL(origin).origin` before comparison, so a
 * caller passing a non-canonical value (a trailing slash, or a full URL with
 * a path) still compares correctly instead of always falling back.
 *
 * Shared by any form using the `redirectTo` field pattern.
 */
export function safeRedirectTarget(form: FormData, origin: string, fallback = '/admin/items'): string {
	const redirectTo = form.get('redirectTo');
	// Require a path (leading "/"), same as before — this alone still lets a
	// protocol-relative URL like "//evil.com/x" through, since it also starts
	// with "/". The origin check below closes that gap.
	if (typeof redirectTo !== 'string' || !redirectTo.startsWith('/')) return fallback;

	let normalizedOrigin: string;
	let resolved: URL;
	try {
		normalizedOrigin = new URL(origin).origin;
		resolved = new URL(redirectTo, normalizedOrigin);
	} catch {
		return fallback;
	}

	if (resolved.origin !== normalizedOrigin) return fallback;

	return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/** JSON response with the right Content-Type. */
export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/** JSON error response: `{ error: code }` with the given status. */
export function jsonError(code: string, status: number): Response {
	return json({ error: code }, status);
}

/**
 * Appends `?error=<code>` to a (relative) redirect target, preserving any
 * existing query string and hash. Returns a path, safe to hand to `redirect()`.
 */
export function redirectWithError(target: string, code: string): string {
	const url = new URL(target, 'https://internal');
	url.searchParams.set('error', code);
	return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Parses a route param (e.g. `params.id`) as a positive integer id, or
 * returns `null` when it's missing or invalid.
 */
export function parseIdParam(value: string | undefined | null): number | null {
	if (value === undefined || value === null || !/^\d+$/.test(value)) return null;
	const n = Number(value);
	return isPositiveInteger(n) ? n : null;
}

/**
 * Reads a request's JSON body. Returns `null` for a malformed body or one
 * that isn't a JSON object (including a literal `null`), so callers can't
 * crash on property access.
 */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
		return body as Record<string, unknown>;
	} catch {
		return null;
	}
}
