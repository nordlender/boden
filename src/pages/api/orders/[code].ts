export const prerender = false;

import type { APIRoute } from 'astro';
import { deleteOrder } from '../../../lib/orders';

export const DELETE: APIRoute = async ({ params, locals }) => {
  // Not covered by src/middleware/index.ts's route-prefix gate (that only
  // matches page routes, not /api/...), so check auth here, same as
  // src/pages/api/orders/create.ts.
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const code = params.code;
  if (!code) {
    return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
  }

  const result = await deleteOrder({ orderCode: code, userId: locals.user.id });
  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    const status = result.error === 'not_found' ? 404 : 409;
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
