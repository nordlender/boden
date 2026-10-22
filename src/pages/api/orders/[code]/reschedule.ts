import type { APIRoute } from 'astro';
import { rescheduleOrder } from '../../../../lib/orders';
import { json, jsonError, readJson, requireUser } from '../../../../lib/http';
import { parseTimeRanges } from '../../../../lib/timeRanges';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const authError = requireUser(locals);
  if (authError) return authError;

  const code = params.code;
  if (!code) {
    return jsonError('invalid_request', 400);
  }

  const body = await readJson(request);
  if (!body) return jsonError('invalid_json', 400);

  const { fromDate, toDate } = body;
  if (typeof fromDate !== 'string' || !fromDate || typeof toDate !== 'string' || !toDate) {
    return jsonError('invalid_dates', 400);
  }
  // New dates need new time ranges (#368); values are validated by rescheduleOrder.
  const pickupRanges = parseTimeRanges(body.pickupRanges);
  const returnRanges = parseTimeRanges(body.returnRanges);
  if (!pickupRanges || !returnRanges) {
    return jsonError('invalid_time_ranges', 400);
  }

  const result = await rescheduleOrder({
    orderCode: code,
    userId: locals.user!.id,
    fromDate,
    toDate,
    timeRanges: { pickup: pickupRanges, return: returnRanges },
  });

  if (!result.ok) {
    // 'not_found' also covers an order owned by someone else — don't leak
    // another member's order by distinguishing the two.
    const status = result.error === 'not_found' ? 404 : result.error === 'invalid_dates' || result.error === 'return_not_pickup_day' || result.error === 'invalid_time_ranges' ? 400 : 409;
    return json(result, status);
  }

  return json(result);
};
