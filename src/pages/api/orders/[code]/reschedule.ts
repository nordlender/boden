import type { APIRoute } from 'astro';
import { rescheduleOrder } from '../../../../lib/orders';
import { json, jsonError, readJsonObject, requireUser } from '../../../../lib/http';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  // Also gated by src/middleware/index.ts's MEMBER_ROUTE_PREFIXES
  // ('/api/orders') — defense-in-depth, keep this inline check too.
  const authError = requireUser(locals);
  if (authError) return authError;

  const code = params.code;
  if (!code) return jsonError('invalid_request', 400);

  const body = await readJsonObject(request);
  if (!body) return jsonError('invalid_json', 400);

  const { fromDate, toDate } = body;
  if (typeof fromDate !== 'string' || typeof toDate !== 'string' || !fromDate || !toDate) {
    return jsonError('invalid_dates', 400);
  }

  const result = await rescheduleOrder({
    orderCode: code,
    userId: locals.user!.id,
    fromDate,
    toDate,
  });

  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    const status = result.error === 'not_found' ? 404 : result.error === 'invalid_dates' ? 400 : 409;
    return json(result, status);
  }

  return json(result);
};
