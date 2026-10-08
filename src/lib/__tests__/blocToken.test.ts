import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REFRESH_SKEW_SECONDS,
  clearBlocRefreshCache,
  ensureFreshBlocToken,
  getRefreshDecision,
  toBlocAccess,
  tokenFieldsFromResponse,
} from '../blocToken';

const NOW = 1_800_000_000;
const creds = (fetchImpl: typeof fetch) => ({ clientId: 'app id', clientSecret: 's3cr+t', fetchImpl });
const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as any;
const failJson = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: false, status, json: async () => body }) as any;

beforeEach(() => clearBlocRefreshCache());
afterEach(() => vi.restoreAllMocks());

describe('getRefreshDecision', () => {
  it('is valid well before expiry', () => {
    expect(getRefreshDecision({ accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 3600 }, NOW)).toBe('valid');
  });

  it('refreshes inside the skew margin and after expiry when a refresh token exists', () => {
    const t = { accessToken: 'a', refreshToken: 'r' };
    expect(getRefreshDecision({ ...t, expiresAt: NOW + REFRESH_SKEW_SECONDS - 1 }, NOW)).toBe('refresh');
    expect(getRefreshDecision({ ...t, expiresAt: NOW - 10 }, NOW)).toBe('refresh');
  });

  it('without a refresh token, stays valid until actual expiry, then expired', () => {
    expect(getRefreshDecision({ accessToken: 'a', expiresAt: NOW + 10 }, NOW)).toBe('valid');
    expect(getRefreshDecision({ accessToken: 'a', expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('treats an unknown expiry as valid (nothing to schedule against)', () => {
    expect(getRefreshDecision({ accessToken: 'a', refreshToken: 'r' }, NOW)).toBe('valid');
  });

  it('never retries once errored, and reports a missing token', () => {
    expect(getRefreshDecision({ blocTokenError: 'RefreshTokenError', refreshToken: 'r', expiresAt: 0 }, NOW)).toBe('failed');
    expect(getRefreshDecision({}, NOW)).toBe('none');
  });
});

describe('tokenFieldsFromResponse', () => {
  it('prefers Auth.js expires_at, falls back to expires_in, and clears earlier errors', () => {
    expect(tokenFieldsFromResponse({ access_token: 'a', refresh_token: 'r', expires_at: NOW + 5 }, NOW)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: NOW + 5,
      blocTokenError: undefined,
    });
    expect(tokenFieldsFromResponse({ access_token: 'a', expires_in: '3600' }, NOW).expiresAt).toBe(NOW + 3600);
    expect(tokenFieldsFromResponse({ access_token: 'a' }, NOW)).toMatchObject({ refreshToken: undefined, expiresAt: undefined });
  });
});

describe('ensureFreshBlocToken', () => {
  it('returns the token untouched and does not call bloc when not expired', async () => {
    const f = okJson({});
    const token = { sub: '12', accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 3600 };
    expect(await ensureFreshBlocToken(token, creds(f), NOW)).toBe(token);
    expect(f).not.toHaveBeenCalled();
  });

  it('refreshes near expiry via the refresh_token grant with client_secret_basic', async () => {
    const f = okJson({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600, token_type: 'bearer' });
    const token = { sub: '12', name: 'X', accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW + 30 };
    const out = await ensureFreshBlocToken(token, creds(f), NOW);
    expect(out).toEqual({ sub: '12', name: 'X', accessToken: 'a2', refreshToken: 'r2', expiresAt: NOW + 3600, blocTokenError: undefined });

    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://rest.bloc.net/OAuth/Token');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${btoa('app+id:s3cr%2Bt')}`);
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({ grant_type: 'refresh_token', refresh_token: 'r1' });
  });

  it('keeps the old refresh token when bloc does not rotate it', async () => {
    const f = okJson({ access_token: 'a2', expires_in: 60 });
    const out = await ensureFreshBlocToken({ accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW }, creds(f), NOW);
    expect(out).toMatchObject({ accessToken: 'a2', refreshToken: 'r1', expiresAt: NOW + 60 });
  });

  it('on refresh failure drops the tokens and sets an error flag, and never retries', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = failJson(400, { error: 'invalid_grant' });
    const out = await ensureFreshBlocToken({ sub: '12', accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW }, creds(f), NOW);
    expect(out).toEqual({ sub: '12', blocTokenError: 'RefreshTokenError' });
    expect(toBlocAccess(out)).toEqual({ userId: '12', accessToken: null, error: 'RefreshTokenError' });

    // A later request with the errored token: no second call to bloc.
    expect(await ensureFreshBlocToken(out, creds(f), NOW + 100)).toBe(out);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('treats a 200 without an access_token, or a network error, as a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW };
    expect(await ensureFreshBlocToken(t, creds(okJson({ error: 'x' })), NOW)).toEqual({ blocTokenError: 'RefreshTokenError' });
    clearBlocRefreshCache();
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as any;
    expect(await ensureFreshBlocToken(t, creds(down), NOW)).toEqual({ blocTokenError: 'RefreshTokenError' });
  });

  it('with no refresh token, marks the token expired once past expiry (no network)', async () => {
    const f = okJson({});
    const out = await ensureFreshBlocToken({ sub: '12', accessToken: 'a1', expiresAt: NOW - 1 }, creds(f), NOW);
    expect(out).toEqual({ sub: '12', blocTokenError: 'AccessTokenExpired' });
    expect(f).not.toHaveBeenCalled();
    expect(toBlocAccess(out).error).toBe('AccessTokenExpired');
  });

  it('shares one refresh between concurrent and shortly-repeated callers with the same refresh token', async () => {
    const f = okJson({ access_token: 'a2', refresh_token: 'r2', expires_in: 3600 });
    const t = { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW };
    const [a, b] = await Promise.all([ensureFreshBlocToken(t, creds(f), NOW), ensureFreshBlocToken(t, creds(f), NOW)]);
    const c = await ensureFreshBlocToken(t, creds(f), NOW);
    expect(a.accessToken).toBe('a2');
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('toBlocAccess', () => {
  it('maps a usable token, a missing session and a token-less session', () => {
    expect(toBlocAccess({ sub: '12', accessToken: 'a' })).toEqual({ userId: '12', accessToken: 'a', error: null });
    expect(toBlocAccess(null)).toEqual({ userId: null, accessToken: null, error: 'NoSession' });
    expect(toBlocAccess({ sub: '12' })).toEqual({ userId: '12', accessToken: null, error: 'NoSession' });
  });
});
