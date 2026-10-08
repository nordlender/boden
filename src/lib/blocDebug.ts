import { BLOC_ORIGIN } from './bloc';
import { json } from './http';

/**
 * Shared plumbing for the permanent live-test routes under
 * src/pages/api/debug/. Takes the caller's own bloc access token from
 * their session (via locals.blocAccess()) and forwards it as a Bearer token to `path`.
 *
 * HARD RULE — only wrap bloc endpoints that are scoped to the CALLER'S OWN
 * token/account (no other-user identifier param). This helper does not and
 * cannot enforce that — it forwards whatever path you give it. The deleted
 * src/pages/api/debug/getpage.ts is the cautionary example: it wrapped
 * Profile/GetPage, which accepts an arbitrary userId, so any signed-in
 * caller could pull ANOTHER member's PII just by knowing/guessing their id.
 * Check a new bloc endpoint's params for exactly that shape before adding
 * a route here, and skip it if found.
 */
export async function callBlocAsSelf(
  // The route's `locals`: its blocAccess() supplies the caller's own token,
  // refreshed first if due (src/lib/blocSession.ts).
  locals: App.Locals,
  // A builder receives the caller's own bloc userId (JWT `sub`) for endpoints
  // that need one, so callers never decode the JWT a second time.
  pathOrBuilder: string | ((ownUserId: string) => string),
): Promise<Response> {
  const access = await locals.blocAccess();

  if (access.accessToken === null) {
    return json({ error: `Not logged in (no usable session access token: ${access.error}).` }, 401);
  }

  let path: string;
  if (typeof pathOrBuilder === 'string') {
    path = pathOrBuilder;
  } else {
    if (!/^\d+$/.test(access.userId)) {
      return json({ error: 'No bloc user id in session.' }, 401);
    }
    path = pathOrBuilder(access.userId);
  }

  try {
    const res = await fetch(`${BLOC_ORIGIN}${path}`, {
      headers: { Authorization: `Bearer ${access.accessToken}` },
    });
    const bodyText = await res.text();
    return json({ status: res.status, ok: res.ok, body: safeJsonParse(bodyText) }, 200);
  } catch (err) {
    return json({ error: `bloc request failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
