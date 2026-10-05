import type { APIRoute } from 'astro';
import { json, jsonError, requireUser } from '../../../lib/http';
import { deleteOrder } from '../../../lib/orders';

export const DELETE: APIRoute = async ({ params, locals }) => {
  const authError = requireUser(locals);
  if (authError) return authError;

  const code = params.code;
  if (!code) {
    return jsonError('invalid_request', 400);
  }

  const result = await deleteOrder({ orderCode: code, userId: locals.user!.id });
  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    const status = result.error === 'not_found' ? 404 : 409;
    return json(result, status);
  }

  return json({ ok: true });
};
