import type { APIRoute } from 'astro';
import { deleteOrder } from '../../../lib/orders';
import { json, jsonError, requireUser } from '../../../lib/http';

export const DELETE: APIRoute = async ({ params, locals }) => {
  // Also gated by src/middleware/index.ts's MEMBER_ROUTE_PREFIXES
  // ('/api/orders') — defense-in-depth, keep this inline check too.
  const authError = requireUser(locals);
  if (authError) return authError;

  const code = params.code;
  if (!code) return jsonError('invalid_request', 400);

  const result = await deleteOrder({ orderCode: code, userId: locals.user!.id });
  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    return json(result, result.error === 'not_found' ? 404 : 409);
  }

  return json({ ok: true });
};
