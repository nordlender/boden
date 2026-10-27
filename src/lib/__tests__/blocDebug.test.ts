import { afterEach, describe, it, expect, vi } from 'vitest';
import { callBlocAsSelf } from '../blocDebug';

describe('callBlocAsSelf', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns 404 outside dev without calling bloc (#246)', async () => {
    vi.stubEnv('DEV', false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await callBlocAsSelf(new Request('https://shop.example.com/api/debug/myaccount'), '/api/Account/MyAccount');

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still requires a session in dev', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('AUTH_SECRET', 'test-secret');

    const res = await callBlocAsSelf(new Request('https://shop.example.com/api/debug/myaccount'), '/api/Account/MyAccount');

    expect(res.status).toBe(401);
  });
});
