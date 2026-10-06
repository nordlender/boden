import type { APIRoute } from 'astro';
import { getCart, setCart } from '../../../lib/cart';
import { createOrder, createSplitOrders } from '../../../lib/orders';
import { isValidDateRange } from '../../../lib/reservation';
import { redirectWithError, requireUser } from '../../../lib/http';

// Maps the checkout form's readonly hasUnpaidFees/userIsMember text inputs
// (literally "Yes" | "No" | "Unknown", see CheckoutForm.astro's yesNo()) back
// to the nullable boolean stored on orders — anything other than an exact
// "Yes"/"No" (including "Unknown", missing, or a tampered value) is treated
// as unknown/null rather than guessed at.
function parseYesNo(value: FormDataEntryValue | null): boolean | null {
  // A File entry (tampered upload) stringifies to '[object File]' — treat it
  // like any other unrecognised value instead of stringifying it.
  if (value === 'Yes') return true;
  if (value === 'No') return false;
  return null;
}

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const authError = requireUser(locals);
  if (authError) return authError;

  const cart = getCart(cookies);
  if (cart.length === 0) {
    return redirect(redirectWithError('/reservation', 'cart_empty'));
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

  // Snapshot of the checkout form's readonly bloc-sourced fields (see
  // schema.ts's orders.hasUnpaidFees/userIsMember doc comment). The form
  // submits the literal string the readonly input displayed
  // ("Yes"/"No"/"Unknown" — see CheckoutForm.astro's yesNo()); still blocked
  // on bloc's hasUnpaidFees/userIsMember API defect for real Yes/No data
  // (see docs/moderator-review.md), so this reads back as null for every
  // member today, but the columns/wiring aren't blocked on that fix.
  const hasUnpaidFees = parseYesNo(form.get('hasUnpaidFees'));
  const userIsMember = parseYesNo(form.get('userIsMember'));

  // Every submitter must accept the liability disclaimer (see #134). Enforced
  // here rather than trusting the form's `required` attribute; the acceptance
  // timestamp is persisted on the order for moderators to see.
  const disclaimerAccepted = form.get('disclaimerAccepted') === 'on';
  if (!disclaimerAccepted) {
    return redirect(redirectWithError('/reservation', 'disclaimer_required'));
  }

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
      return redirect(redirectWithError('/reservation', 'unavailable'));
    }
    // 'user_not_found': defense-in-depth only — orders.userId's FK didn't
    // resolve for locals.user.id, which upsertUser guarantees exists in
    // normal operation. See orders.ts's createOrder/createSplitOrders.
    if (result.error === 'user_not_found') {
      return redirect(redirectWithError('/reservation', 'account_not_found'));
    }
    // 'empty_cart' from createOrder means every line was dropped as
    // unrentable (archived item/unpublished product) — see orders.ts. Distinct
    // from the 'cart_empty' check above, where the cart cookie itself was empty.
    return redirect(redirectWithError('/reservation', result.error === 'empty_cart' ? 'items_unrentable' : 'order_failed'));
  }

  setCart(cookies, []);
  return redirect(`/checkout/success?receipt=${result.checkoutToken}`, 303);
};
