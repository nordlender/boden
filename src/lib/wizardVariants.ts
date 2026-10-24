// Bulk admin-wizard operations shared by a product's two kinds of variant —
// items (wizard.ts, /admin/items) and sets (setWizard.ts, /admin/sets). Only
// the parts that really are identical live here; anything kind-specific
// (e.g. setItemsProduct's attribute fan-out) stays in its own file. The
// routes' URL/form wiring is in wizardRoutes.ts.
import { db } from '../db/client';
import { items, sets } from '../db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export type VariantKind = 'item' | 'set';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const tables = { item: items, set: sets } as const;
const otherKind = { item: 'set', set: 'item' } as const;

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

// Bulk archive ({ archived: true }) and bulk "Set image" ({ imageUrl }) —
// the same plain single-statement update on every selected row. Deliberately
// limited to these columns: productId has its own guarded paths
// (setItemsProduct/setSetsProduct).
export async function updateVariants(
	kind: VariantKind,
	ids: number[],
	patch: { archived?: true; imageUrl?: string },
): Promise<void> {
	if (ids.length === 0) return;
	const table = tables[kind];
	await db.update(table).set(patch).where(inArray(table.id, ids));
}
