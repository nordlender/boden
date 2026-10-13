import type { APIRoute } from 'astro';
import { callBlocAsSelf } from '../../../lib/blocDebug';

// Per-request: reads the caller's session (output is static by default).
export const prerender = false;

// Profile/GetPage's route was previously deleted because it takes an
// arbitrary `userId` param — wrapping it verbatim would let any signed-in
// caller pull another member's PII just by guessing/knowing their id (see
// blocDebug.ts's hard rule). This version stays safe by only ever passing
// the CALLER's OWN bloc userId (the session's `sub`, via callBlocAsSelf's builder), never one
// read from the request — one-off inspection of the response shape, not a
// generic passthrough.
export const GET: APIRoute = ({ locals }) =>
  callBlocAsSelf(locals, (ownUserId) => `/api/profile/getpage?userId=${ownUserId}`);
