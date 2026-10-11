import { getToken } from '@auth/core/jwt';

// bloc's dedicated fee/membership method (api/fee/GetMemberFeeStatus?userId=...).
// The only source of hasUnpaidFees/userIsMember — the account/* profile
// responses return them as null (see docs/bloc-api.md addendum 2026-09-02) and
// are no longer read for them.
const BLOC_API_BASE_URL = 'https://rest.bloc.net/api/';
const FETCH_TIMEOUT_MS = 5000;

export interface MemberFeeStatus {
  hasUnpaidFees: boolean | null;
  userIsMember: boolean | null;
}

const UNKNOWN: MemberFeeStatus = { hasUnpaidFees: null, userIsMember: null };

const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

// Confirmed live response: { userId, siteId, isMember, hasUnpaidFees, success,
// message, errorCode, errorMessage } — note `isMember`, not `userIsMember`.
// Fails soft to unknown (null) on anything but an explicit success: the order
// snapshot already treats null as "Unknown", and a slow/failed bloc call
// shouldn't block the page (hence the timeout).
export async function fetchMemberFeeStatus(
  userId: number | string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MemberFeeStatus> {
  try {
    const url = `${BLOC_API_BASE_URL}fee/GetMemberFeeStatus?userId=${encodeURIComponent(String(userId))}`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[bloc] GetMemberFeeStatus returned ${res.status} for userId=${userId}`);
      return UNKNOWN;
    }
    const data = await res.json();
    if (data?.success !== true) {
      console.warn(`[bloc] GetMemberFeeStatus unsuccessful for userId=${userId}: ${data?.errorMessage ?? ''}`);
      return UNKNOWN;
    }
    return { hasUnpaidFees: asBool(data.hasUnpaidFees), userIsMember: asBool(data.isMember) };
  } catch (err) {
    console.warn(`[bloc] GetMemberFeeStatus failed for userId=${userId}:`, err);
    return UNKNOWN;
  }
}

// Live status for the signed-in caller, from their session cookie: the JWT's
// `sub` is bloc's userId (set in src/auth.ts) and `accessToken` stays
// server-side only. Unknown if there's no session.
export async function fetchOwnMemberFeeStatus(request: Request): Promise<MemberFeeStatus> {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  const accessToken = typeof token?.accessToken === 'string' ? token.accessToken : undefined;
  if (!token?.sub || !accessToken) return UNKNOWN;
  return fetchMemberFeeStatus(token.sub, accessToken);
}
