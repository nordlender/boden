export const prerender = false;

import type { APIRoute } from 'astro';
import { fetchOwnMemberFeeStatus } from '../../../lib/blocFeeStatus';
import { getCart, setCart } from '../../../lib/cart';
import { createOrder, createSplitOrders } from '../../../lib/orders';
import { isValidDateRange } from '../../../lib/reservation';
import { requireUser } from '../../../lib/wizard-http';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  // Not covered by src/middleware/index.ts's route-prefix gate (that only
  // matches /cart, /checkout, /orders — not /api/...), so check auth here,
  // same as docs/rental-shop.md §9's confirm.ts/return.ts examples.
  const authError = requireUser(locals);
  if (authError) return authError;

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

  // Snapshot of the checkout form's contact fields, persisted on the order
  // (see schema.ts's orders.contactName doc comment) — independent of the
  // member's live profile, which can change later.
  const contactName = form.get('name')?.toString().trim() ?? '';
  const contactEmail = form.get('email')?.toString().trim() ?? '';
  const contactMobile = form.get('mobile')?.toString().trim() || null;

  // Every submitter must accept the liability disclaimer (see #134). Enforced
  // here rather than trusting the form's `required` attribute; the acceptance
  // timestamp is persisted on the order for moderators to see.
  const disclaimerAccepted = form.get('disclaimerAccepted') === 'on';
  if (!disclaimerAccepted) {
    return redirect('/reservation?error=disclaimer_required');
  }

  // Snapshot of bloc's fee/membership status (see schema.ts's
  // orders.hasUnpaidFees/userIsMember doc comment), fetched server-side from
  // GetMemberFeeStatus (src/lib/blocFeeStatus.ts) at submit time — never taken
  // from the posted form, whose readonly inputs a member could forge. null
  // (Unknown) if the call failed. After the cheap validation redirects so
  // those never wait on bloc.
  const { hasUnpaidFees, userIsMember } = await fetchOwnMemberFeeStatus(request);

  // Populated by the reservation page's split-order action when the member
  // moves one or more mixed-availability lines (items or sets) into their
  // own order — see ReservationForm.astro and
  // src/lib/orders.ts's createSplitOrders. Each key is cart.ts's
  // entryKey format ('item:<id>' or 'set:<id>').
  const splitLineKeys = (form.get('splitLineKeys')?.toString() ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const result =
    splitLineKeys.length > 0
      ? await createSplitOrders({
          userId: locals.user!.id,
          role: locals.user!.role,
          note,
          cartEntries: cart,
          fromDate,
          toDate,
          splitLineKeys,
          contactName,
          contactEmail,
          contactMobile,
          hasUnpaidFees,
          userIsMember,
          disclaimerAccepted,
        })
      : await createOrder({
          userId: locals.user!.id,
          role: locals.user!.role,
          note,
          cartEntries: cart,
          fromDate,
          toDate,
          contactName,
          contactEmail,
          contactMobile,
          hasUnpaidFees,
          userIsMember,
          disclaimerAccepted,
        });
  if (!result.ok) {
    // 'unavailable': re-checked at insert time (see orders.ts's insertOrder)
    // and found the member's cart/dates changed since the last availability
    // preview — same query-param error pattern as 'invalid_dates' below.
    if (result.error === 'unavailable') {
      return redirect('/reservation?error=unavailable');
    }
    // 'user_not_found': defense-in-depth only — orders.userId's FK didn't
    // resolve for locals.user.id, which upsertUser guarantees exists in
    // normal operation. See orders.ts's createOrder/createSplitOrders.
    if (result.error === 'user_not_found') {
      return redirect('/cart?error=account_not_found');
    }
    return redirect('/cart?error=empty_cart');
  }

  setCart(cookies, []);
  return redirect(`/checkout/success?receipt=${result.checkoutToken}`, 303);
};
