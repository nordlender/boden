export const prerender = false;

import type { APIRoute } from 'astro';
import { rescheduleOrder } from '../../../../lib/orders';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
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

  let body: { fromDate?: string; toDate?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  if (!body.fromDate || !body.toDate) {
    return new Response(JSON.stringify({ error: 'invalid_dates' }), { status: 400 });
  }

  const result = await rescheduleOrder({
    orderCode: code,
    userId: locals.user.id,
    fromDate: body.fromDate,
    toDate: body.toDate,
  });

  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    const status = result.error === 'not_found' ? 404 : result.error === 'invalid_dates' ? 400 : 409;
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
