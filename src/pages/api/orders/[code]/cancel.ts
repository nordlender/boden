import type { APIRoute } from 'astro';
import { cancelOrder } from '../../../../lib/orders';
import { json, jsonError, requireUser } from '../../../../lib/http';
import { setOrderNotice } from '../../../../lib/orderNotice';

// Member soft-cancels their own 'scheduled' order (#371) — see
// src/lib/orders.ts's cancelOrder. A 'requested' order is hard-deleted via
// DELETE /api/orders/[code] instead.
export const POST: APIRoute = async ({ params, locals, cookies }) => {
  const authError = requireUser(locals);
  if (authError) return authError;

  const code = params.code;
  if (!code) {
    return jsonError('invalid_request', 400);
  }

  const result = await cancelOrder({ orderCode: code, userId: locals.user!.id });
  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    const status = result.error === 'not_found' ? 404 : 409;
    return json(result, status);
  }

  setOrderNotice(cookies, 'cancelled', code);
  return json({ ok: true });
};
