import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REFRESH_SKEW_SECONDS,
  clearBlocRefreshCache,
  ensureFreshBlocToken,
  getRefreshDecision,
  isReauthError,
  refreshBlocToken,
  toBlocAccess,
  tokenFieldsFromResponse,
} from '../blocToken';

const NOW = 1_800_000_000;
const creds = (fetchImpl: typeof fetch) => ({ clientId: 'app id', clientSecret: 's3cr+t', fetchImpl });
const okJson = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as any;
const failJson = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: false, status, json: async () => body }) as any;

// The refresh cache's TTLs run on Date.now(); keep it in step with NOW.
const setClock = (unixSeconds: number) => vi.setSystemTime(unixSeconds * 1000);

beforeEach(() => {
  clearBlocRefreshCache();
  vi.useFakeTimers({ toFake: ['Date'] });
  setClock(NOW);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getRefreshDecision', () => {
  it('is valid well before expiry', () => {
    expect(getRefreshDecision({ accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 3600 }, NOW)).toBe('valid');
  });

  it('refreshes inside the skew margin and after expiry when a refresh token exists', () => {
    const t = { accessToken: 'a', refreshToken: 'r' };
    expect(getRefreshDecision({ ...t, expiresAt: NOW + REFRESH_SKEW_SECONDS - 1 }, NOW)).toBe('refresh');
    expect(getRefreshDecision({ ...t, expiresAt: NOW - 10 }, NOW)).toBe('refresh');
  });

  it('without a refresh token, is expired inside the same skew margin', () => {
    expect(getRefreshDecision({ accessToken: 'a', expiresAt: NOW + REFRESH_SKEW_SECONDS + 1 }, NOW)).toBe('valid');
    expect(getRefreshDecision({ accessToken: 'a', expiresAt: NOW + 10 }, NOW)).toBe('expired');
    expect(getRefreshDecision({ accessToken: 'a', expiresAt: NOW - 1 }, NOW)).toBe('expired');
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

  it('on an OAuth rejection (400/401) drops the tokens, sets an error flag, and never retries', async () => {
    for (const [status, body] of [
      [400, { error: 'invalid_grant' }],
      [401, { error: 'invalid_client' }],
    ] as const) {
      clearBlocRefreshCache();
      const f = failJson(status, body);
      const res = await refreshBlocToken({ sub: '12', accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW }, creds(f), NOW);
      expect(res).toEqual({ token: { sub: '12', blocTokenError: 'RefreshTokenError' }, outcome: 'invalidated' });
      expect(toBlocAccess(res.token)).toEqual({ userId: '12', accessToken: null, error: 'RefreshTokenError' });

      // A later request with the errored token: no second call to bloc.
      expect(await ensureFreshBlocToken(res.token, creds(f), NOW + 100)).toBe(res.token);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it('treats timeouts, network errors, 5xx and unusable 200s as transient: tokens kept, retried later', async () => {
    const t = { sub: '12', accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW - 5 };
    const failures = [
      vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')),
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      failJson(503, null),
      okJson({ error: 'x' }),
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }),
    ] as any[];
    for (const f of failures) {
      clearBlocRefreshCache();
      const res = await refreshBlocToken(t, creds(f), NOW);
      expect(res).toEqual({ token: t, outcome: 'transient' });
      // Expired, so not usable for this request — but not a sign-in prompt.
      const access = toBlocAccess(res.token, NOW);
      expect(access).toEqual({ userId: '12', accessToken: null, error: 'RefreshUnavailable' });
      expect(isReauthError(access.error)).toBe(false);
    }
  });

  it('a transient failure is only briefly cached (stampede guard), then retried', async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: 'a2', expires_in: 3600 }) }) as any;
    const t = { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW + 10 };
    expect((await refreshBlocToken(t, creds(f), NOW)).outcome).toBe('transient');
    // Still inside the skew window but not expired: usable this request.
    expect(toBlocAccess({ ...t, sub: '1' }, NOW).accessToken).toBe('a1');

    setClock(NOW + 5);
    expect((await refreshBlocToken(t, creds(f), NOW + 5)).outcome).toBe('transient');
    expect(f).toHaveBeenCalledTimes(1);

    setClock(NOW + 11);
    const res = await refreshBlocToken(t, creds(f), NOW + 11);
    expect(res.outcome).toBe('refreshed');
    expect(res.token.accessToken).toBe('a2');
    expect(f).toHaveBeenCalledTimes(2);
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

describe('refresh-token rotation', () => {
  const rotating = (n: number) => ({ access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 3600 });

  it('maps a rotated-away refresh token to its new tokens long after the rotation, without asking bloc', async () => {
    const f = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => rotating(2) }) as any;
    const old = { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW };
    expect((await refreshBlocToken(old, creds(f), NOW)).token).toMatchObject({ accessToken: 'a2', refreshToken: 'r2' });

    // 30 min later the new cookie never arrived; the old one comes back.
    setClock(NOW + 1800);
    const again = await refreshBlocToken(old, creds(f), NOW + 1800);
    expect(again).toMatchObject({ outcome: 'refreshed', token: { accessToken: 'a2', refreshToken: 'r2' } });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('follows the old -> new chain when the mapped tokens are themselves due', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rotating(2) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rotating(3) }) as any;
    const old = { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW };
    await refreshBlocToken(old, creds(f), NOW);

    setClock(NOW + 7200); // a2 has expired too
    const res = await refreshBlocToken(old, creds(f), NOW + 7200);
    expect(res.token).toMatchObject({ accessToken: 'a3', refreshToken: 'r3', expiresAt: NOW + 7200 + 3600 });
    const body = Object.fromEntries(new URLSearchParams(f.mock.calls[1][1].body));
    expect(body.refresh_token).toBe('r2');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('re-spends a non-rotating refresh token once its cached result is due again', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'a2', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'a3', expires_in: 3600 }) }) as any;
    const t = { accessToken: 'a1', refreshToken: 'r1', expiresAt: NOW };
    await refreshBlocToken(t, creds(f), NOW);

    setClock(NOW + 7200);
    const res = await refreshBlocToken({ ...t, accessToken: 'a2', expiresAt: NOW + 3600 }, creds(f), NOW + 7200);
    expect(res.token).toMatchObject({ accessToken: 'a3', refreshToken: 'r1' });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('toBlocAccess', () => {
  it('maps a usable token, a missing session and a session without a bloc token', () => {
    expect(toBlocAccess({ sub: '12', accessToken: 'a' })).toEqual({ userId: '12', accessToken: 'a', error: null });
    expect(toBlocAccess(null)).toEqual({ userId: null, accessToken: null, error: 'NoSession' });
    expect(toBlocAccess({ sub: '12' })).toEqual({ userId: '12', accessToken: null, error: 'NoBlocToken' });
  });

  it('flags which errors a fresh sign-in fixes', () => {
    expect(['RefreshTokenError', 'AccessTokenExpired', 'NoBlocToken'].every((e) => isReauthError(e as any))).toBe(true);
    expect([null, 'NoSession', 'RefreshUnavailable'].some((e) => isReauthError(e as any))).toBe(false);
  });
});
