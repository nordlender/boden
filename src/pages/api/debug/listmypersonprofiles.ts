import type { APIRoute } from 'astro';
import { callBlocAsSelf } from '../../../lib/blocDebug';

// Per-request: reads the caller's session (output is static by default).
export const prerender = false;

// Permanent live-test route for the caller's own bloc access token — see
// src/lib/blocDebug.ts for the shared plumbing and the hard rule on which
// bloc endpoints are safe to wrap here. Manual tool only; this repo has no
// automated test runner.
export const GET: APIRoute = ({ locals }) => callBlocAsSelf(locals, '/api/account/listmypersonprofiles');
