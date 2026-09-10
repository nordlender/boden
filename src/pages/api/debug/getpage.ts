import type { APIRoute } from 'astro';
import { getToken } from '@auth/core/jwt';
import { callBlocAsSelf } from '../../../lib/blocDebug';

export const prerender = false;

// Profile/GetPage's route was previously deleted because it takes an
// arbitrary `userId` param — wrapping it verbatim would let any signed-in
// caller pull another member's PII just by guessing/knowing their id (see
// blocDebug.ts's hard rule). This version stays safe by only ever passing
// the CALLER's OWN bloc userId (from their own session token), never one
// read from the request — one-off inspection of the response shape, not a
// generic passthrough.
export const GET: APIRoute = async ({ request }) => {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  const bloc = token?.bloc as { userId?: number } | undefined;
  const userId = bloc?.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Not logged in, or no bloc.userId on this session.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return callBlocAsSelf(request, `/api/profile/getpage?userId=${userId}`);
};
