import { afterEach, describe, it, expect, vi } from 'vitest';

// DEV_MODE is read once at module load, so each test stubs the env and then
// imports a fresh copy of blocDebug (and devMode underneath it).
async function loadCallBlocAsSelf(devMode: string | undefined) {
  if (devMode !== undefined) vi.stubEnv('DEV_MODE', devMode);
  vi.resetModules();
  return (await import('../blocDebug')).callBlocAsSelf;
}

const request = () => new Request('https://shop.example.com/api/debug/myaccount');

describe('callBlocAsSelf', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns 404 without DEV_MODE, without calling bloc (#246)', async () => {
    const callBlocAsSelf = await loadCallBlocAsSelf(undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await callBlocAsSelf(request(), '/api/Account/MyAccount');

    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still requires a session with DEV_MODE=true', async () => {
    const callBlocAsSelf = await loadCallBlocAsSelf('true');
    vi.stubEnv('AUTH_SECRET', 'test-secret');

    const res = await callBlocAsSelf(request(), '/api/Account/MyAccount');

    expect(res.status).toBe(401);
  });
});
