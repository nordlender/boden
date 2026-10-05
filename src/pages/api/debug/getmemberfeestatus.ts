import type { APIRoute } from 'astro';
import { getToken } from '@auth/core/jwt';
import { callBlocAsSelf } from '../../../lib/blocDebug';

export const prerender = false;

// Live-test route for bloc's fee/GetMemberFeeStatus, to see the raw response
// shape (src/lib/blocFeeStatus.ts maps isMember/hasUnpaidFees).
// That method takes a userId, which the blocDebug.ts hard rule warns about —
// so any `?userId=` is deliberately ignored and the caller's OWN id (the JWT
// `sub`, which src/auth.ts sets to bloc's userId) is always used.
export const GET: APIRoute = async ({ request }) => {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  const userId = token?.sub;
  if (!userId || !/^\d+$/.test(userId)) {
    return new Response(JSON.stringify({ error: 'Not logged in (no bloc user id in session).' }, null, 2), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return callBlocAsSelf(request, `/api/fee/GetMemberFeeStatus?userId=${userId}`);
};
