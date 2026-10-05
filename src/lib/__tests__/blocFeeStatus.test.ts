import { describe, expect, it, vi } from 'vitest';
import { fetchMemberFeeStatus } from '../blocFeeStatus';

const json = (body: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => body }) as any;

describe('fetchMemberFeeStatus', () => {
  it('calls the endpoint with userId and bearer token and maps the flags', async () => {
    const f = json({ userId: 12, siteId: 1, isMember: true, hasUnpaidFees: false, success: true, errorCode: 0 });
    expect(await fetchMemberFeeStatus(12, 'tok', f)).toEqual({ hasUnpaidFees: false, userIsMember: true });
    expect(f).toHaveBeenCalledWith('https://rest.bloc.net/api/fee/GetMemberFeeStatus?userId=12', {
      headers: { Authorization: 'Bearer tok' },
    });
  });
  it('returns nulls on non-ok, bad shape, or network error', async () => {
    const unknown = { hasUnpaidFees: null, userIsMember: null };
    expect(await fetchMemberFeeStatus(1, 't', json({}, false))).toEqual(unknown);
    expect(await fetchMemberFeeStatus(1, 't', json({ hasUnpaidFees: 'x' }))).toEqual(unknown);
    expect(await fetchMemberFeeStatus(1, 't', json({ success: false, isMember: true, hasUnpaidFees: false }))).toEqual(unknown);
    expect(await fetchMemberFeeStatus(1, 't', vi.fn().mockRejectedValue(new Error('x')) as any)).toEqual(unknown);
  });
});
