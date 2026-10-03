// Shared helpers for src/pages/api/cart/{add,update,remove}.ts — each of
// those routes was independently re-parsing "which of itemId/setId did this
// request name" and re-checking "is that item/set actually addable right
// now", which had already drifted once between add.ts and update.ts. One
// shared implementation instead.
import { db } from '../db/client';

export type CartEntryKind = 'item' | 'set';

// A product's variant picker (or a route's own hidden inputs) submits
// exactly one of itemId/setId — see cart.ts's entryKey for the same
// item-or-set split on the read side. Returns null when neither is present.
export function parseCartEntryKind(rawItemId: FormDataEntryValue | null, rawSetId: FormDataEntryValue | null): CartEntryKind | null {
	if (rawItemId !== null) return 'item';
	if (rawSetId !== null) return 'set';
	return null;
}

// True when the given item/set is a live row belonging to a published
// product, not archived — i.e. actually addable to a cart right now. Used
// by add.ts unconditionally, and by update.ts only for a quantity > 0
// (removing a line, or zeroing it out, is always allowed regardless — see
// update.ts's own comment on why).
export async function isCartEntryAvailable(kind: CartEntryKind, id: number): Promise<boolean> {
	if (kind === 'item') {
		const item = await db.query.items.findFirst({ where: (t, { eq }) => eq(t.id, id), with: { product: true } });
		if (!item) return false;
		return !item.archived && item.product?.status === 'published';
	}
	const set = await db.query.sets.findFirst({ where: (t, { eq }) => eq(t.id, id), with: { product: true } });
	if (!set) return false;
	return !set.archived && set.product?.status === 'published';
}
