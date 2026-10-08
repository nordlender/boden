import type { APIRoute } from 'astro';
import { fetchOwnMemberFeeStatus } from '../../../lib/blocFeeStatus';
import { getCart, setCart } from '../../../lib/cart';
import { createOrder } from '../../../lib/orders';
import { isValidDateRange } from '../../../lib/reservation';
import { redirectWithError, requireUser } from '../../../lib/http';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const authError = requireUser(locals);
  if (authError) return authError;

  const cart = getCart(cookies);
  if (cart.length === 0) {
    return redirect(redirectWithError('/cart', 'empty_cart'));
  }

  const form = await request.formData();
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
    return redirect('/reservation?error=disclaimer_required');
  }

  // Snapshot of bloc's fee/membership status (see schema.ts's
  // orders.hasUnpaidFees/userIsMember doc comment), fetched server-side from
  // GetMemberFeeStatus (src/lib/blocFeeStatus.ts) at submit time — never taken
  // from the posted form, whose readonly inputs a member could forge. null
  // (Unknown) if the call failed. After the cheap validation redirects so
  // those never wait on bloc.
  const { hasUnpaidFees, userIsMember } = await fetchOwnMemberFeeStatus(await locals.blocAccess());

  const result = await createOrder({
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
      return redirect(redirectWithError('/reservation', 'unavailable'));
    }
    // 'user_not_found': defense-in-depth only — orders.userId's FK didn't
    // resolve for locals.user.id, which upsertUser guarantees exists in
    // normal operation. See orders.ts's createOrder.
    if (result.error === 'user_not_found') {
      return redirect(redirectWithError('/cart', 'account_not_found'));
    }
    return redirect(redirectWithError('/cart', 'empty_cart'));
  }

  setCart(cookies, []);
  return redirect(`/checkout/success?order=${result.orderCode}`, 303);
};
