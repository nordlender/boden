import { describe, expect, it, vi } from 'vitest';
import { fetchMemberFeeStatus, fetchOwnMemberFeeStatus } from '../blocFeeStatus';

const json = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body }) as any;
const UNKNOWN = { hasUnpaidFees: null, userIsMember: null };

describe('fetchMemberFeeStatus', () => {
  it('calls the endpoint with userId and bearer token and maps the flags', async () => {
    const f = json({ userId: 12, siteId: 1, isMember: true, hasUnpaidFees: false, success: true, errorCode: 0 });
    expect(await fetchMemberFeeStatus(12, 'tok', f)).toEqual({ hasUnpaidFees: false, userIsMember: true });
    expect(f).toHaveBeenCalledWith(
      'https://rest.bloc.net/api/fee/GetMemberFeeStatus?userId=12',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' }, signal: expect.any(AbortSignal) }),
    );
  });

  it('returns unknown on a non-ok response', async () => {
    expect(await fetchMemberFeeStatus(1, 't', json({}, false))).toEqual(UNKNOWN);
  });

  it('returns unknown unless success is explicitly true', async () => {
    const flags = { isMember: true, hasUnpaidFees: false };
    expect(await fetchMemberFeeStatus(1, 't', json({ ...flags, success: false }))).toEqual(UNKNOWN);
    expect(await fetchMemberFeeStatus(1, 't', json({ ...flags, errorCode: 5 }))).toEqual(UNKNOWN);
  });

  it('maps non-boolean flags to null individually', async () => {
    const f = json({ success: true, isMember: 'true', hasUnpaidFees: true });
    expect(await fetchMemberFeeStatus(1, 't', f)).toEqual({ hasUnpaidFees: true, userIsMember: null });
  });

  it('returns unknown on invalid JSON, network error or timeout', async () => {
    const badJson = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('x'); } }) as any;
    expect(await fetchMemberFeeStatus(1, 't', badJson)).toEqual(UNKNOWN);
    expect(await fetchMemberFeeStatus(1, 't', vi.fn().mockRejectedValue(new Error('x')) as any)).toEqual(UNKNOWN);
    const timeout = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')) as any;
    expect(await fetchMemberFeeStatus(1, 't', timeout)).toEqual(UNKNOWN);
  });
});

describe('fetchOwnMemberFeeStatus', () => {
  it('returns unknown without calling bloc when there is no usable token', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    expect(await fetchOwnMemberFeeStatus({ userId: null, accessToken: null, error: 'NoSession' })).toEqual(UNKNOWN);
    expect(await fetchOwnMemberFeeStatus({ userId: '12', accessToken: null, error: 'RefreshTokenError' })).toEqual(UNKNOWN);
    expect(f).not.toHaveBeenCalled();
    f.mockRestore();
  });
});
