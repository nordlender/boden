// Shared plumbing for src/pages/api/messages/*.ts routes that act on a
// single message by id (delete, pin, unpin) — previously duplicated
// verbatim across those files. add.ts/update.ts aren't built on this: they
// take more than an id (content) and redirect with an ?error= on failure
// rather than silently no-op'ing, so they don't fit this shape.
import type { APIContext, APIRoute } from 'astro';
import { getMessageById, type MessageRow } from './messages';
import { isPositiveInteger, safeRedirectTarget } from './http';

/**
 * Returns a 403 Response if `locals`/`message` fail the route's
 * authorization rule, or `null` if the caller may proceed. Takes the loaded
 * message (not just `locals`) so per-message rules — e.g. delete.ts's "a
 * moderator may delete only their own message" — can be expressed at the
 * call site.
 */
export type AuthorizeMessageAction = (locals: APIContext['locals'], message: MessageRow) => Response | null;

/**
 * Builds a POST APIRoute for an action keyed by a message id:
 * parses `id` from the submitted form, loads that message, checks
 * `authorize`, runs `action(id)` if authorized, and redirects to the form's
 * `redirectTo` (falling back to `/admin`) either way. A missing/invalid id
 * or a message that no longer exists just redirects without running the
 * action or the authorization check — a tampered form is a silent no-op.
 */
export function withMessageIdAction(action: (id: number) => Promise<void>, authorize: AuthorizeMessageAction): APIRoute {
	return async ({ request, locals, redirect, url }) => {
		const form = await request.formData();
		const idRaw = form.get('id');
		const id = typeof idRaw === 'string' ? Number(idRaw) : Number.NaN;
		const redirectTo = safeRedirectTarget(form, url.origin, '/admin');

		if (!isPositiveInteger(id)) return redirect(redirectTo);

		const message = await getMessageById(id);
		if (!message) return redirect(redirectTo);

		const denied = authorize(locals, message);
		if (denied) return denied;

		await action(id);
		return redirect(redirectTo);
	};
}
