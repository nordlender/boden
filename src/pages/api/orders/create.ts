import type { APIRoute } from 'astro';
import { fetchOwnMemberFeeStatus } from '../../../lib/blocFeeStatus';
import { finishCheckout, loadCart } from '../../../lib/cart';
import { isCartId, parseCartEntries, sameSnapshot } from '../../../lib/cartEntries';
import { createOrder, findOrderCodeForCart } from '../../../lib/orders';
import { isValidDateRange } from '../../../lib/reservation';
import { redirectWithError, requireUser } from '../../../lib/http';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const authError = requireUser(locals);
  if (authError) return authError;
  const userId = locals.user!.id;

  const form = await request.formData();

  // The cart the member confirmed on /reservation/confirm: its id and the
  // lines shown there, posted by CartNextButton.astro.
  const cartId = form.get('cartId')?.toString();
  const cartEntries = parseCartEntries(form.get('cartEntries')?.toString() ?? '');
  if (!isCartId(cartId) || cartEntries === null) {
    return redirect(redirectWithError('/reservation', 'order_failed'));
  }

  // Already ordered (double-click, Back + resubmit, a retried request): the
  // cart id was replaced after that order (finishCheckout), so this isn't a
  // changed cart — show the order it already became.
  const existingOrderCode = await findOrderCodeForCart(userId, cartId);
  if (existingOrderCode) {
    return redirect(`/checkout/success?order=${existingOrderCode}`, 303);
  }

  // Only order exactly what the member confirmed: if the cart changed since
  // (another tab, a newer order), send them back to see it.
  const current = await loadCart(cookies);
  if (!sameSnapshot(current, { cartId, entries: cartEntries })) {
    return redirect(redirectWithError('/reservation', 'cart_changed'));
  }
  if (cartEntries.length === 0) {
    return redirect(redirectWithError('/reservation', 'cart_empty'));
  }

  const note = form.get('note')?.toString().trim() || null;
  const fromDate = form.get('fromDate')?.toString() ?? '';
  const toDate = form.get('toDate')?.toString() ?? '';
  if (!isValidDateRange({ from: fromDate, to: toDate })) {
    return redirect(redirectWithError('/reservation', 'invalid_dates'));
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
    return redirect(redirectWithError('/reservation', 'disclaimer_required'));
  }

  // Snapshot of bloc's fee/membership status (see schema.ts's
  // orders.hasUnpaidFees/userIsMember doc comment), fetched server-side from
  // GetMemberFeeStatus (src/lib/blocFeeStatus.ts) at submit time — never taken
  // from the posted form, whose readonly inputs a member could forge. null
  // (Unknown) if the call failed. After the cheap validation redirects so
  // those never wait on bloc.
  const { hasUnpaidFees, userIsMember } = await fetchOwnMemberFeeStatus(request);

  const result = await createOrder({
    userId,
    role: locals.user!.role,
    note,
    cartEntries,
    cartId,
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
    // A concurrent submit of the same cart got there first (see
    // orders.ts's insertOrder) — same outcome as the check above.
    if (result.error === 'already_ordered' && result.orderCode) {
      return redirect(`/checkout/success?order=${result.orderCode}`, 303);
    }
    // 'unavailable': re-checked at insert time (see orders.ts's insertOrder)
    // and found the member's cart/dates changed since the last availability
    // preview — same query-param error pattern as 'invalid_dates' above.
    if (result.error === 'unavailable') {
      return redirect(redirectWithError('/reservation', 'unavailable'));
    }
    // 'user_not_found': defense-in-depth only — orders.userId's FK didn't
    // resolve for locals.user.id, which upsertUser guarantees exists in
    // normal operation. See orders.ts's createOrder.
    if (result.error === 'user_not_found') {
      return redirect(redirectWithError('/reservation', 'account_not_found'));
    }
    // 'empty_cart' from createOrder means every line was dropped as
    // unrentable (archived item/set) — see orders.ts. Distinct from the
    // 'cart_empty' check above, where the confirmed cart itself was empty.
    return redirect(redirectWithError('/reservation', result.error === 'empty_cart' ? 'items_unrentable' : 'order_failed'));
  }

  finishCheckout(cookies, cartEntries);
  return redirect(`/checkout/success?order=${result.orderCode}`, 303);
};
