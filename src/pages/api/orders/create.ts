export const prerender = false;

import type { APIRoute } from 'astro';
import { getCart, setCart } from '../../../lib/cart';
import { createOrder } from '../../../lib/orders';

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

  // TODO: to be implemented later when API is updated — bloc currently always
  // returns null for both fields (see TASKS.md WIP), so they aren't persisted
  // yet. Read here so wiring them up later is a one-line change.
  const hasUnpaidFees = form.get('hasUnpaidFees');
  const userIsMember = form.get('userIsMember');

  const result = await createOrder({ userId: locals.user.id, note, cartEntries: cart });
  if (!result.ok) {
    return redirect('/cart?error=empty_cart');
  }

  setCart(cookies, []);
  return redirect(`/checkout/success?order=${result.orderCode}`, 303);
};
