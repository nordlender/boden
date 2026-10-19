// Bulk admin-wizard operations shared by a product's two kinds of variant —
// items (wizard.ts, /admin/items) and sets (setWizard.ts, /admin/sets). Only
// the parts that really are identical live here; anything kind-specific
// (e.g. setItemsProduct's attribute fan-out) stays in its own file.
import { db } from '../db/client';
import { items, sets } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export type VariantKind = 'item' | 'set';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const tables = { item: items, set: sets } as const;
const otherKind = { item: 'set', set: 'item' } as const;

// Per-kind wiring for the /api/wizard/[kind]/* routes: the URL segment maps
// to the kind, the selection form's checkbox field, and the page to land on
// when the form carries no usable `redirectTo`.
const routes = {
	items: { kind: 'item', idsField: 'itemIds', fallback: '/admin/items' },
	sets: { kind: 'set', idsField: 'setIds', fallback: '/admin/sets' },
} as const;

export type VariantRoute = (typeof routes)[keyof typeof routes];

// Explicit comparison rather than `segment in routes` — a segment like
// "constructor" would otherwise resolve through Object.prototype.
export function variantRoute(segment: string | undefined): VariantRoute | null {
	return segment === 'items' || segment === 'sets' ? routes[segment] : null;
}

// Thrown by setItemsProduct/setSetsProduct when the target product already
// has non-archived variants of the *other* kind — a product's variants are
// assumed all items or all sets, never a mix (see
// src/components/shop/VariantPicker.astro's comment). `existing` is that
// other kind; `reason` is the code api/wizard/[kind]/set-product.ts hands
// back to the toolbar's AssignWarning popover.
export class ProductKindConflictError extends Error {
	readonly reason: `product_has_${VariantKind}s`;

	constructor(readonly existing: VariantKind) {
		super(`This product already has ${existing}s assigned — a product cannot mix item and set variants.`);
		this.name = 'ProductKindConflictError';
		this.reason = `product_has_${existing}s`;
	}
}

// Takes the transaction doing the reassignment, so nothing of the other kind
// can be assigned between this check and the write.
export function assertProductAcceptsKind(tx: Tx, productId: number, kind: VariantKind): void {
	const existing = otherKind[kind];
	const table = tables[existing];
	const conflict = tx
		.select({ id: table.id })
		.from(table)
		.where(and(eq(table.productId, productId), eq(table.archived, false)))
		.get();
	if (conflict) throw new ProductKindConflictError(existing);
}

export async function archiveVariants(kind: VariantKind, ids: number[]): Promise<void> {
	if (ids.length === 0) return;
	const table = tables[kind];
	await db.update(table).set({ archived: true }).where(inArray(table.id, ids));
}

// Bulk "Set image" — the same imageUrl on every selected row. A plain
// single-statement update; nothing hangs off imageUrl.
export async function setVariantsImage(kind: VariantKind, ids: number[], imageUrl: string): Promise<void> {
	if (ids.length === 0) return;
	const table = tables[kind];
	await db.update(table).set({ imageUrl }).where(inArray(table.id, ids));
}
