import type { APIRoute } from 'astro';
import { callBlocAsSelf } from '../../../lib/blocDebug';

// Profile/GetPage takes an arbitrary `userId` param — wrapping it verbatim
// would let any signed-in caller pull another member's PII just by
// guessing/knowing their id (see blocDebug.ts's hard rule). The builder form
// only ever passes the CALLER's OWN bloc userId (the JWT `sub`), never one
// read from the request — one-off inspection of the response shape, not a
// generic passthrough.
export const GET: APIRoute = ({ request }) =>
  callBlocAsSelf(request, (ownUserId) => `/api/profile/getpage?userId=${ownUserId}`);
