import type { APIRoute } from 'astro';
import { callBlocAsSelf } from '../../../lib/blocDebug';

export const prerender = false;

// Live-test route for bloc's fee/GetMemberFeeStatus, to see the raw response
// (src/lib/blocFeeStatus.ts maps isMember/hasUnpaidFees).
// That method takes a userId, which the blocDebug.ts hard rule warns about —
// so any `?userId=` is deliberately ignored and the caller's OWN id (the JWT
// `sub`, which src/auth.ts sets to bloc's userId) is always used.
export const GET: APIRoute = ({ request }) =>
  callBlocAsSelf(request, (ownUserId) => `/api/fee/GetMemberFeeStatus?userId=${ownUserId}`);
