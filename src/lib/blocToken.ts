import { BLOC_OAUTH_TOKEN_URL } from './bloc';

// Lifecycle of the bloc OAuth access token carried in the Auth.js JWT (#319).
//
// The token is captured at sign-in (src/auth.ts's jwt callback) and used
// server-side for live bloc calls (src/lib/blocFeeStatus.ts). Auth.js's
// session cookie slides for 30 days, so it can easily outlive the bloc
// access token. This module decides, per request, whether the stored token
// is still usable, refreshes it via the standard OAuth2 refresh_token grant
// when bloc gave us a refresh token, and otherwise marks it as expired so
// callers fail soft and the UI can prompt a fresh sign-in.
//
// Whether bloc actually returns `refresh_token` / `expires_in` from
// OAuth/Token is not documented anywhere we can reach (no discovery
// document, nothing in its OpenAPI spec). So every branch here is driven by
// what the sign-in token response actually contained:
// - expires_in present + refresh_token present -> refreshed ahead of expiry
// - expires_in present, no refresh_token      -> marked expired (with the
//   same skew) so the UI prompts a fresh sign-in
// - no expires_in                              -> treated as valid (nothing
//   to schedule against); a 401 then fails soft in the caller as before.
//
// Pure apart from the injectable fetch, so the decision logic is unit-tested
// (src/lib/__tests__/blocToken.test.ts) without Auth.js or Astro.


// Refresh this long before the reported expiry, so a token that's valid when
// checked doesn't expire mid-request (clock skew, slow bloc calls).
export const REFRESH_SKEW_SECONDS = 60;
const REFRESH_TIMEOUT_MS = 5000;

// How long a settled refresh is reused for the refresh token it spent:
// - success: long. Requests can still carry the old cookie after a rotation
//   (in flight when the new one was set, auth-astro's getSession() discarding
//   the jwt callback's Set-Cookie, or the new cookie never reaching the
//   browser at all). Replaying a rotated refresh token would be rejected and
//   end the session's bloc access, so the old token keeps mapping to the
//   tokens it was exchanged for — bounded by REFRESH_CACHE_MAX_ENTRIES.
// - rejection: long too; it's permanent anyway, no point asking again.
// - transient failure (timeout, network, 5xx, unparseable body): only a few
//   seconds, just enough to stop a burst of requests stampeding bloc.
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const REJECTED_TTL_MS = 60 * 60 * 1000;
const TRANSIENT_TTL_MS = 10 * 1000;
const REFRESH_CACHE_MAX_ENTRIES = 1000;
// A cached rotation result can itself be due for refresh by now — follow
// the old -> new chain this many hops at most.
const MAX_REFRESH_HOPS = 3;

// Why the session currently has no usable bloc access token. Exposed on the
// (client-visible) session so the UI can prompt a fresh sign-in; the tokens
// themselves never are. Both are permanent until the next sign-in.
export type BlocTokenError = 'RefreshTokenError' | 'AccessTokenExpired';

// The bloc-token fields src/auth.ts keeps on the Auth.js JWT (server-side
// only — never copied onto the session object).
export interface BlocTokenFields {
  accessToken?: string;
  refreshToken?: string;
  // Absolute expiry, unix seconds (Auth.js's account.expires_at convention).
  expiresAt?: number;
  blocTokenError?: BlocTokenError;
}

// Why a request has no usable bloc token:
// - BlocTokenError: expired / refresh rejected — a fresh sign-in fixes it.
// - 'NoBlocToken': signed in, but the JWT carries no bloc token (e.g. a
//   session from before tokens were stored) — a fresh sign-in fixes it too.
// - 'RefreshUnavailable': the token is expired and bloc couldn't be reached
//   to refresh it right now; tokens are kept and the next request retries.
// - 'NoSession': not signed in.
export type BlocAccessError = BlocTokenError | 'NoBlocToken' | 'RefreshUnavailable' | 'NoSession';

// What server-side bloc callers get for the current request (see
// src/lib/blocSession.ts). `accessToken` is null whenever there's nothing
// usable; `error` says why.
export type BlocAccess =
  | { userId: string; accessToken: string; error: null }
  | { userId: string | null; accessToken: null; error: BlocAccessError };

// Errors a fresh sign-in fixes (show the "Sign in again" prompt for these).
export const isReauthError = (error: BlocAccessError | null): boolean =>
  error === 'RefreshTokenError' || error === 'AccessTokenExpired' || error === 'NoBlocToken';

export type RefreshDecision =
  // Usable as-is (including: expiry unknown).
  | 'valid'
  // Near/after expiry and we hold a refresh token.
  | 'refresh'
  // Near/after expiry, no refresh token — nothing to do but re-auth.
  | 'expired'
  // Already marked failed/expired earlier — never retried (no loop).
  | 'failed'
  // No access token at all (e.g. a session from before this existed).
  | 'none';

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function getRefreshDecision(token: BlocTokenFields, now: number = nowSeconds()): RefreshDecision {
  if (token.blocTokenError) return 'failed';
  if (typeof token.accessToken !== 'string' || !token.accessToken) return 'none';
  if (typeof token.expiresAt !== 'number') return 'valid';
  if (now < token.expiresAt - REFRESH_SKEW_SECONDS) return 'valid';
  // Same skew without a refresh token, so a token about to die prompts a
  // sign-in instead of failing mid-request.
  return token.refreshToken ? 'refresh' : 'expired';
}

// Shape of Auth.js's `account` (the token endpoint response, with
// expires_at already computed from expires_in by Auth.js).
export interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  expires_at?: number;
}

function expiresAtFrom(res: OAuthTokenResponse, now: number): number | undefined {
  if (typeof res.expires_at === 'number' && Number.isFinite(res.expires_at)) return res.expires_at;
  const inSeconds = Number(res.expires_in);
  return res.expires_in != null && Number.isFinite(inSeconds) && inSeconds > 0 ? now + inSeconds : undefined;
}

// Fresh bloc-token fields from a sign-in (or refresh) token response. Clears
// any earlier error so signing in again restores bloc access.
export function tokenFieldsFromResponse(res: OAuthTokenResponse, now: number = nowSeconds()): BlocTokenFields {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token || undefined,
    expiresAt: expiresAtFrom(res, now),
    blocTokenError: undefined,
  };
}

export interface BlocClientCredentials {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

// The app's bloc OAuth client, as registered with bloc (same values the
// provider in src/auth.ts uses for the code exchange).
export function blocClientCredentials(): BlocClientCredentials {
  return { clientId: import.meta.env.BLOC_APPID, clientSecret: import.meta.env.OAUTH_CLIENT_SECRET };
}

// Same client authentication Auth.js used for the original code exchange
// (client_secret_basic, form-urlencoded id/secret — see @auth/core's
// oauth callback), which bloc demonstrably accepts.
function basicAuth(clientId: string, clientSecret: string): string {
  const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
  return `Basic ${btoa(`${enc(clientId)}:${enc(clientSecret)}`)}`;
}

// The token endpoint definitively refused the refresh token (RFC 6749 §5.2:
// 400/401, e.g. invalid_grant). Permanent — only a fresh sign-in helps.
// Anything else thrown by requestBlocTokenRefresh is transient.
export class BlocRefreshRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly oauthError: string | undefined,
  ) {
    super(`bloc token refresh rejected: ${status}${oauthError ? ` ${oauthError}` : ''}`);
    this.name = 'BlocRefreshRejectedError';
  }
}

// One refresh_token grant against bloc's OAuth/Token. Throws
// BlocRefreshRejectedError on a 400/401, any other error on a transient
// failure. Never logs token values.
export async function requestBlocTokenRefresh(
  refreshToken: string,
  { clientId, clientSecret, fetchImpl = fetch }: BlocClientCredentials,
  now: number = nowSeconds(),
): Promise<BlocTokenFields> {
  const res = await fetchImpl(BLOC_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: basicAuth(clientId, clientSecret),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => null)) as (OAuthTokenResponse & { error?: string }) | null;
  if (res.status === 400 || res.status === 401) {
    throw new BlocRefreshRejectedError(res.status, typeof data?.error === 'string' ? data.error : undefined);
  }
  if (!res.ok || typeof data?.access_token !== 'string' || !data.access_token) {
    throw new Error(`bloc token refresh failed (transient): ${res.status}${data ? '' : ' unparseable body'}`);
  }
  return tokenFieldsFromResponse(data, now);
}

// In-process cache of refreshes, keyed by the refresh token being spent:
// concurrent requests share one in-flight grant, and settled results are
// reused per the TTLs above. Single Node process (@astrojs/node standalone),
// so module scope is enough. Insertion-ordered Map -> oldest evicted first.
interface CacheEntry {
  result: Promise<BlocTokenFields>;
  expiresAtMs?: number; // unset while in flight
  value?: BlocTokenFields; // set once it succeeded
}
const refreshCache = new Map<string, CacheEntry>();

function pruneCache(nowMs: number): void {
  for (const [key, entry] of refreshCache) {
    if (entry.expiresAtMs !== undefined && entry.expiresAtMs <= nowMs) refreshCache.delete(key);
  }
  while (refreshCache.size >= REFRESH_CACHE_MAX_ENTRIES) {
    const oldest = refreshCache.keys().next().value;
    if (oldest === undefined) break;
    refreshCache.delete(oldest);
  }
}

function cachedRefresh(refreshToken: string, creds: BlocClientCredentials, now: number): Promise<BlocTokenFields> {
  pruneCache(Date.now());
  const cached = refreshCache.get(refreshToken);
  // A cached success that's itself due for refresh again, and didn't rotate
  // to a new refresh token (so the caller's hop loop can't move past it), is
  // stale: spend the same refresh token again instead of reusing it.
  const stale =
    cached?.value !== undefined &&
    (cached.value.refreshToken ?? refreshToken) === refreshToken &&
    getRefreshDecision({ ...cached.value, refreshToken }, now) === 'refresh';
  if (cached && !stale) return cached.result;
  if (stale) refreshCache.delete(refreshToken);
  const entry: CacheEntry = { result: requestBlocTokenRefresh(refreshToken, creds, now) };
  entry.result.then(
    (value) => {
      entry.value = value;
      entry.expiresAtMs = Date.now() + SUCCESS_TTL_MS;
    },
    (err) => {
      entry.expiresAtMs = Date.now() + (err instanceof BlocRefreshRejectedError ? REJECTED_TTL_MS : TRANSIENT_TTL_MS);
    },
  );
  refreshCache.set(refreshToken, entry);
  return entry.result;
}

// Test hook: forget every cached refresh result.
export function clearBlocRefreshCache(): void {
  refreshCache.clear();
}

const withoutBlocTokens = <T extends BlocTokenFields>(token: T, error: BlocTokenError): T => {
  const rest: T = { ...token, blocTokenError: error };
  delete rest.accessToken;
  delete rest.refreshToken;
  delete rest.expiresAt;
  return rest;
};

export type RefreshOutcome =
  // Nothing needed doing; token returned as-is.
  | 'unchanged'
  // New access token (and possibly rotated refresh token) merged in.
  | 'refreshed'
  // Tokens dropped + blocTokenError set (expired w/o refresh token, or the
  // refresh token was rejected). Permanent until the next sign-in.
  | 'invalidated'
  // bloc unreachable / 5xx / timeout: token returned untouched (refresh
  // token kept, nothing to persist); the next request retries.
  | 'transient';

// Like ensureFreshBlocToken, but also says what happened — src/lib/
// blocSession.ts needs that to decide whether to re-issue the cookie.
export async function refreshBlocToken<T extends BlocTokenFields>(
  token: T,
  creds: BlocClientCredentials,
  now: number = nowSeconds(),
): Promise<{ token: T; outcome: RefreshOutcome }> {
  let current = token;
  let outcome: RefreshOutcome = 'unchanged';
  for (let hop = 0; hop < MAX_REFRESH_HOPS; hop++) {
    const decision = getRefreshDecision(current, now);
    if (decision === 'expired') return { token: withoutBlocTokens(current, 'AccessTokenExpired'), outcome: 'invalidated' };
    if (decision !== 'refresh') return { token: current, outcome };
    try {
      const fresh = await cachedRefresh(current.refreshToken!, creds, now);
      current = {
        ...current,
        ...fresh,
        // bloc may not rotate refresh tokens — keep the old one if so.
        refreshToken: fresh.refreshToken ?? current.refreshToken,
      };
      outcome = 'refreshed';
    } catch (err) {
      if (err instanceof BlocRefreshRejectedError) {
        console.warn(`[bloc] ${err.message}; bloc calls disabled until next sign-in`);
        return { token: withoutBlocTokens(current, 'RefreshTokenError'), outcome: 'invalidated' };
      }
      console.warn('[bloc] access token refresh failed, will retry:', err instanceof Error ? err.message : err);
      // Keep whatever we had (incl. an earlier hop's refresh) — never
      // discard tokens over a transient failure.
      return { token: current, outcome: outcome === 'refreshed' ? 'refreshed' : 'transient' };
    }
  }
  return { token: current, outcome };
}

// The jwt-callback step: returns `token` unchanged when nothing needs doing
// (or bloc is temporarily unreachable), a refreshed copy when due, or a copy
// with the bloc tokens dropped and `blocTokenError` set when the token can't
// be renewed. Once errored it is never retried, so a dead refresh token
// can't loop — only a fresh sign-in clears it (tokenFieldsFromResponse).
export async function ensureFreshBlocToken<T extends BlocTokenFields>(
  token: T,
  creds: BlocClientCredentials,
  now: number = nowSeconds(),
): Promise<T> {
  return (await refreshBlocToken(token, creds, now)).token;
}

// Collapse a (possibly refreshed) JWT into what server-side bloc callers use.
// A token past its expiry here means the refresh was transiently
// unavailable — not usable for this request, but kept for the next one.
export function toBlocAccess(
  token: (BlocTokenFields & { sub?: string | null }) | null,
  now: number = nowSeconds(),
): BlocAccess {
  const userId = token?.sub ?? null;
  if (!token || !userId) return { userId: null, accessToken: null, error: 'NoSession' };
  if (token.blocTokenError) return { userId, accessToken: null, error: token.blocTokenError };
  if (typeof token.accessToken !== 'string' || !token.accessToken) {
    return { userId, accessToken: null, error: 'NoBlocToken' };
  }
  if (typeof token.expiresAt === 'number' && now >= token.expiresAt) {
    return { userId, accessToken: null, error: 'RefreshUnavailable' };
  }
  return { userId, accessToken: token.accessToken, error: null };
}
