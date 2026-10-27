import { getToken } from '@auth/core/jwt';
import { json } from './http';

const BLOC_BASE_URL = 'https://rest.bloc.net';

/**
 * Shared plumbing for the permanent live-test routes under
 * src/pages/api/debug/. Fetches the caller's own bloc access token from
 * their session cookie and forwards it as a Bearer token to `path`.
 *
 * DEV ONLY — outside `astro dev` every route using this returns 404, so the
 * raw bloc passthrough never ships in a production build (#246).
 *
 * HARD RULE — only wrap bloc endpoints that are scoped to the CALLER'S OWN
 * token/account (no other-user identifier param). This helper does not and
 * cannot enforce that — it forwards whatever path you give it. Endpoints
 * that take a userId, like Profile/GetPage, must use the builder form so the
 * id is always the caller's own: an earlier getpage.ts passed a userId read
 * from the request, so any signed-in caller could pull ANOTHER member's PII
 * just by knowing/guessing their id. Check a new bloc endpoint's params for
 * exactly that shape before adding a route here.
 */
export async function callBlocAsSelf(
  request: Request,
  // A builder receives the caller's own bloc userId (JWT `sub`) for endpoints
  // that need one, so callers never decode the JWT a second time.
  pathOrBuilder: string | ((ownUserId: string) => string),
): Promise<Response> {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  const accessToken = typeof token?.accessToken === 'string' ? token.accessToken : undefined;

  if (!accessToken) {
    return json({ error: 'Not logged in (no session access token found).' }, 401);
  }

  let path: string;
  if (typeof pathOrBuilder === 'string') {
    path = pathOrBuilder;
  } else {
    if (!token?.sub || !/^\d+$/.test(token.sub)) {
      return json({ error: 'No bloc user id in session.' }, 401);
    }
    path = pathOrBuilder(token.sub);
  }

  try {
    const res = await fetch(`${BLOC_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
