import { getToken } from '@auth/core/jwt';

const BLOC_BASE_URL = 'https://rest.bloc.net';

/**
 * Shared plumbing for the permanent live-test routes under
 * src/pages/api/debug/. Fetches the caller's own bloc access token from
 * their session cookie and forwards it as a Bearer token to `path`.
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
export async function callBlocAsSelf(request: Request, path: string): Promise<Response> {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  const accessToken = typeof token?.accessToken === 'string' ? token.accessToken : undefined;

  if (!accessToken) {
    return jsonResponse({ error: 'Not logged in (no session access token found).' }, 401);
  }

  try {
    const res = await fetch(`${BLOC_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const bodyText = await res.text();
    return jsonResponse({ status: res.status, ok: res.ok, body: safeJsonParse(bodyText) }, 200);
  } catch (err) {
    return jsonResponse({ error: `bloc request failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
