// Shared helpers for src/pages/api/wizard/*.ts route handlers: the admin
// role-gate and the post-submit redirect target, both previously duplicated
// verbatim in every wizard API route.

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
 * Parses and validates a set of required positive-integer form fields in one
 * call — replaces each caller re-deriving the same `Number(form.get(...))` +
 * `isPositiveInteger` check (and usually the same error message) for its own
 * id/quantity fields, which had already drifted into copy-pasted duplicates
 * across a few src/pages/api/wizard/set-component-*.ts routes.
 *
 * Returns `null` — not a partial object — the moment any named field is
 * missing or not a positive integer, so a caller only has one thing to check
 * before using every field.
 */
export function requirePositiveIntFields<K extends string>(form: FormData, keys: readonly K[]): Record<K, number> | null {
	const result = {} as Record<K, number>;
	for (const key of keys) {
		const value = Number(form.get(key));
		if (!isPositiveInteger(value)) return null;
		result[key] = value;
	}
	return result;
}

/**
 * Parses the "create a named thing" form shared by the item and set wizards'
 * create routes (items.ts / sets.ts) — a required `name` plus an optional
 * `imageUrl`, both trimmed. Returns `null` when `name` is missing or blank, so
 * the caller only has to supply its own noun for the 400 message.
 */
export function parseNamedEntityForm(form: FormData): { name: string; imageUrl: string | null } | null {
	const name = form.get('name')?.toString().trim();
	if (!name) return null;
	const imageUrl = form.get('imageUrl')?.toString().trim() || null;
	return { name, imageUrl };
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
 * Returns a 403 Response if the current request isn't from at least a
 * moderator (admins included — see `isModerator`), or `null` if the caller
 * may proceed.
 */
export function requireModerator(locals: APIContext['locals']): Response | null {
	if (!isModerator(locals.user?.role)) {
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
 * Despite the "wizard" module name, this is shared by any admin form using
 * the same `redirectTo` pattern — not wizard-specific.
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
