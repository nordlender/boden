import type { AstroCookies } from 'astro';
import { Auth, raw } from '@auth/core';
import { getToken } from '@auth/core/jwt';
import authConfig from 'auth:config';
import {
  blocClientCredentials,
  ensureFreshBlocToken,
  getRefreshDecision,
  toBlocAccess,
  type BlocAccess,
  type BlocTokenFields,
} from './blocToken';

// Server-side bloc access for the current request, with the token refreshed
// first when due (#319). Exposed to pages/endpoints as the memoized
// `Astro.locals.blocAccess()` (src/middleware/index.ts).
//
// Why not just rely on the jwt callback: server code reads the JWT with
// getToken(), which decodes the cookie without running any Auth.js
// callback — so a refresh done only in src/auth.ts's jwt callback would
// happen only when the browser hits /api/auth/session. Here we refresh
// directly (deduped with the jwt callback via blocToken.ts's cache) and then
// let Auth.js re-issue the session cookie through its own session action,
// so chunking, cookie names and options stay Auth.js's.

// Runs Auth.js's session action for this request (which runs the jwt
// callback, i.e. the same refresh) and applies the resulting Set-Cookie(s),
// so the browser keeps the renewed token for later requests.
async function persistRenewedSession(request: Request, cookies: AstroCookies): Promise<void> {
  const prefix = authConfig.prefix ?? '/api/auth';
  const url = new URL(`${prefix}/session`, request.url);
  const res = await Auth(new Request(url, { headers: request.headers }), {
    ...authConfig,
    secret: import.meta.env.AUTH_SECRET,
    trustHost: authConfig.trustHost ?? true,
    raw,
  });
  for (const { name, value, options } of res.cookies ?? []) {
    cookies.set(name, value, options as Parameters<AstroCookies['set']>[2]);
  }
}

export async function resolveBlocAccess(request: Request, cookies: AstroCookies): Promise<BlocAccess> {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  if (!token?.sub) return toBlocAccess(null);

  const decision = getRefreshDecision(token as BlocTokenFields);
  if (decision !== 'refresh' && decision !== 'expired') return toBlocAccess(token as BlocTokenFields & { sub: string });

  const renewed = await ensureFreshBlocToken(token as BlocTokenFields & { sub: string }, blocClientCredentials());
  try {
    await persistRenewedSession(request, cookies);
  } catch (err) {
    // The renewed token still serves this request; the next one retries
    // (and hits the refresh cache instead of spending the refresh token again).
    console.warn('[bloc] could not re-issue the session cookie after a token refresh:', err);
  }
  return toBlocAccess(renewed);
}
