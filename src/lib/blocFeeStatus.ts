// bloc's dedicated fee/membership method (api/fee/GetMemberFeeStatus?userId=...).
// Replaces reading hasUnpaidFees/userIsMember off the account/* profile
// responses, which always returned null (see docs/bloc-api.md addendum 2026-09-02).
const BLOC_API_BASE_URL = 'https://rest.bloc.net/api/';

export interface MemberFeeStatus {
  hasUnpaidFees: boolean | null;
  userIsMember: boolean | null;
}

const UNKNOWN: MemberFeeStatus = { hasUnpaidFees: null, userIsMember: null };

const asBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

// Confirmed live response: { userId, siteId, isMember, hasUnpaidFees, success,
// message, errorCode, errorMessage } — note `isMember`, not `userIsMember`.
// Fails soft to unknown (null) rather than blocking sign-in/checkout:
// the order snapshot already treats null as "Unknown".
export async function fetchMemberFeeStatus(
  userId: number | string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MemberFeeStatus> {
  try {
    const url = `${BLOC_API_BASE_URL}fee/GetMemberFeeStatus?userId=${encodeURIComponent(String(userId))}`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.warn(`[bloc] GetMemberFeeStatus returned ${res.status} for userId=${userId}`);
      return UNKNOWN;
    }
    const data = await res.json();
    if (data?.success === false) {
      console.warn(`[bloc] GetMemberFeeStatus success=false for userId=${userId}: ${data?.errorMessage ?? ''}`);
      return UNKNOWN;
    }
    return { hasUnpaidFees: asBool(data?.hasUnpaidFees), userIsMember: asBool(data?.isMember) };
  } catch (err) {
    console.warn(`[bloc] GetMemberFeeStatus failed for userId=${userId}:`, err);
    return UNKNOWN;
  }
}
