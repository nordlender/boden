export const prerender = false;

import type { APIRoute } from 'astro';
import { getCart, setCart } from '../../../lib/cart';
import { createOrder, createSplitOrders } from '../../../lib/orders';
import { isValidDateRange } from '../../../lib/reservation';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  // Not covered by src/middleware/index.ts's route-prefix gate (that only
  // matches /cart, /checkout, /orders — not /api/...), so check auth here,
  // same as docs/rental-shop.md §9's confirm.ts/return.ts examples.
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cart = getCart(cookies);
  if (cart.length === 0) {
    return redirect('/cart?error=empty_cart');
  }

  const form = await request.formData();
  const note = form.get('note')?.toString().trim() || null;
  const fromDate = form.get('fromDate')?.toString() ?? '';
  const toDate = form.get('toDate')?.toString() ?? '';
  if (!isValidDateRange({ from: fromDate, to: toDate })) {
    return redirect('/reservation?error=invalid_dates');
  }

  // TODO: to be implemented later when API is updated — bloc currently always
  // returns null for both fields (see TASKS.md WIP), so they aren't persisted
  // yet. Read here so wiring them up later is a one-line change.
  const hasUnpaidFees = form.get('hasUnpaidFees');
  const userIsMember = form.get('userIsMember');

  // Populated by the reservation page's split-order action when the member
  // moves one or more mixed-availability items into their own order — see
  // ReservationForm.astro and src/lib/orders.ts's createSplitOrders.
  const splitItemIds = (form.get('splitItemIds')?.toString() ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  const result =
    splitItemIds.length > 0
      ? await createSplitOrders({ userId: locals.user.id, note, cartEntries: cart, fromDate, toDate, splitItemIds })
      : await createOrder({ userId: locals.user.id, note, cartEntries: cart, fromDate, toDate });
  if (!result.ok) {
    return redirect('/cart?error=empty_cart');
  }

  setCart(cookies, []);
  const orderCodes = 'orders' in result ? result.orders.map((o) => o.orderCode) : [result.orderCode];
  return redirect(`/checkout/success?order=${orderCodes.join(',')}`, 303);
};
