// Shared helpers for src/pages/api/cart/{add,update-all}.ts: which of
// itemId/setId a request names, and whether that item/set can be added
// right now — one implementation so the routes can't drift apart.
import { db } from '../db/client';
import { getValidSetIds } from './sets';

export type CartEntryKind = 'item' | 'set';

// A product's variant picker (or a route's own hidden inputs) submits
// exactly one of itemId/setId — see cart.ts's entryKey for the same
// item-or-set split on the read side. Returns null when neither is present.
export function parseCartEntryKind(rawItemId: FormDataEntryValue | null, rawSetId: FormDataEntryValue | null): CartEntryKind | null {
	if (rawItemId !== null) return 'item';
	if (rawSetId !== null) return 'set';
	return null;
}

// The `{ itemId } | { setId }` ref (cartEntries.ts's EntryRef) for a parsed
// kind + id — what cart.ts keys a line by.
export function cartEntryRef(kind: CartEntryKind, id: number): { itemId: number } | { setId: number } {
	return kind === 'item' ? { itemId: id } : { setId: id };
}

// True when the given item/set is a live row belonging to a published
// product, not archived — and, for a set, orderable (components present and
// not archived, sets.ts's getValidSetIds) — i.e. the same lines
// cart.ts's getCartLines shows. Used by add.ts unconditionally, and by
// update-all.ts only for a changed quantity > 0 (removing a line is always
// allowed).
export async function isCartEntryAvailable(kind: CartEntryKind, id: number): Promise<boolean> {
	if (kind === 'item') {
		const item = await db.query.items.findFirst({ where: (t, { eq }) => eq(t.id, id), with: { product: true } });
		if (!item) return false;
		return !item.archived && item.product?.status === 'published';
	}
	const set = await db.query.sets.findFirst({ where: (t, { eq }) => eq(t.id, id), with: { product: true } });
	if (!set || set.archived || set.product?.status !== 'published') return false;
	return (await getValidSetIds([id])).has(id);
}
