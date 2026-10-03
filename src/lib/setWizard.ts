// Admin authoring layer for the /admin/sets wizard (issue #214) — mirrors
// wizard.ts's shape (list/create/archive/bulk-assign) for the `sets` table.
// Kept separate from sets.ts: that file is the schema-level "resolve a set
// to its components" API shared by cart/orders/reservation/shop, not the
// admin-authoring surface.
import { db } from '../db/client';
import { sets, setItems } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { reservedQuantitiesByItem } from './stock';
import { computeSetAvailability, getSetComponentDisplayBulk, type SetComponentDisplay } from './sets';

export interface WizardSet {
	id: number;
	name: string;
	label: string | null;
	imageUrl: string | null;
	productId: number | null;
	productTitle?: string;
	inStock: number;
	totalStock: number;
	components: WizardSetComponent[];
	hasArchivedComponent: boolean;
	includes: SetComponentDisplay[];
}

export interface WizardSetComponent {
	itemId: number;
	name: string;
	productTitle?: string;
	imageUrl: string | null;
	archived: boolean;
	quantity: number;
}

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.trim()
		// Collapses every run of non-alphanumeric characters (globally) into
		// one dash first, so by construction there's at most one leading and
		// one trailing dash left to trim — no `+` needed on these two, which
		// is what keeps them out of super-linear-backtracking territory.
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-/, '')
		.replace(/-$/, '');
	return base || 'set';
}

async function uniqueSetSlug(name: string): Promise<string> {
	const base = slugify(name);
	let candidate = base;
	let suffix = 2;
	while (await db.query.sets.findFirst({ where: (t, { eq }) => eq(t.slug, candidate) })) {
		candidate = `${base}-${suffix++}`;
	}
	return candidate;
}

export async function getWizardSets(): Promise<{ unassigned: WizardSet[]; assigned: WizardSet[] }> {
	const rows = await db.query.sets.findMany({
		where: (t, { eq }) => eq(t.archived, false),
		orderBy: (t, { asc }) => asc(t.id),
		with: {
			product: true,
			setItems: { with: { item: { with: { product: true } } } },
		},
	});

	const componentItemIds = rows.flatMap((row) => row.setItems.map((setItem) => setItem.itemId));
	const reserved = await reservedQuantitiesByItem(componentItemIds);
	const includesBySet = await getSetComponentDisplayBulk(rows.map((row) => row.id));

	const wizardSets: WizardSet[] = rows.map((row) => {
		const { stockCount, inStock } = computeSetAvailability(
			row.setItems.map((setItem) => ({ itemId: setItem.itemId, quantity: setItem.quantity, stockCount: setItem.item.stockCount })),
			reserved,
		);
		return {
			id: row.id,
			name: row.name,
			label: row.label,
			imageUrl: row.imageUrl,
			productId: row.productId,
			productTitle: row.product?.title,
			inStock,
			totalStock: stockCount,
			components: row.setItems.map((setItem) => ({
				itemId: setItem.itemId,
				name: setItem.item.name,
				productTitle: setItem.item.product?.title,
				imageUrl: setItem.item.imageUrl,
				archived: setItem.item.archived,
				quantity: setItem.quantity,
			})),
			hasArchivedComponent: row.setItems.some((setItem) => setItem.item.archived),
			includes: includesBySet.get(row.id) ?? [],
		};
	});

	return {
		unassigned: wizardSets.filter((set) => set.productId === null),
		assigned: wizardSets.filter((set) => set.productId !== null),
	};
}

// Candidate items for the component picker — every non-archived item,
// regardless of product assignment (an unassigned item can still be added;
// getSetComponentDisplayBulk just falls back to its internal name until
// it's assigned, same fallback sets.ts's SetChildDetail uses).
export async function listComponentItemOptions(): Promise<{ id: number; name: string; productTitle?: string }[]> {
	const rows = await db.query.items.findMany({
		where: (t, { eq }) => eq(t.archived, false),
		orderBy: (t, { asc }) => asc(t.name),
		with: { product: true },
	});
	return rows.map((row) => ({ id: row.id, name: row.name, productTitle: row.product?.title }));
}

export async function createSet(input: { name: string; imageUrl?: string | null }): Promise<number> {
	const slug = await uniqueSetSlug(input.name);
	const [created] = await db
		.insert(sets)
		.values({ name: input.name, slug, imageUrl: input.imageUrl?.trim() || null })
		.returning({ id: sets.id });
	return created.id;
}

export async function archiveSets(setIds: number[]): Promise<void> {
	if (setIds.length === 0) return;
	await db.update(sets).set({ archived: true }).where(inArray(sets.id, setIds));
}

export async function setSetsImage(setIds: number[], imageUrl: string): Promise<void> {
	if (setIds.length === 0) return;
	await db.update(sets).set({ imageUrl }).where(inArray(sets.id, setIds));
}

// No attribute fan-out to worry about on reassignment (unlike
// wizard.ts's setItemsProduct) — sets don't own attribute values.
export async function setSetsProduct(setIds: number[], productId: number): Promise<void> {
	if (setIds.length === 0) return;

	// Mirrors wizard.ts's setItemsProduct's own guard — a product's variants
	// are assumed all items or all sets, never a mix (see
	// src/components/shop/VariantPicker.astro's comment). Enforced on both
	// write paths so the invalid state can't be created from either side.
	const existingItem = await db.query.items.findFirst({
		where: (t, { eq: eqCol, and: andCol }) => andCol(eqCol(t.productId, productId), eqCol(t.archived, false)),
	});
	if (existingItem) {
		throw new Error('This product already has items assigned — a product cannot mix item and set variants.');
	}

	await db.update(sets).set({ productId }).where(inArray(sets.id, setIds));
}

export async function setSetLabel(setId: number, label: string): Promise<void> {
	const trimmed = label.trim();
	await db
		.update(sets)
		.set({ label: trimmed || null })
		.where(eq(sets.id, setId));
}

// "Add component": bumps the existing row's quantity if the item is already
// part of the set, rather than erroring or creating a second row — the
// unique(setId, itemId) index means this is the only valid way to add an
// already-present item again.
//
// Rejects an archived or nonexistent item: the admin picker already filters
// archived items out, but a direct POST could still add one, and a set
// containing an archived component is invalid (sets.ts's getValidSetIds) —
// it would silently become unorderable.
export async function addSetComponent(setId: number, itemId: number, quantity: number): Promise<void> {
	const item = await db.query.items.findFirst({ where: (t, { eq }) => eq(t.id, itemId) });
	if (!item || item.archived) throw new Error(`Item ${itemId} is missing or archived`);
	await db
		.insert(setItems)
		.values({ setId, itemId, quantity })
		.onConflictDoUpdate({
			target: [setItems.setId, setItems.itemId],
			set: { quantity: sql`${setItems.quantity} + ${quantity}` },
		});
}

// Editing an existing row's quantity field, as opposed to addSetComponent's
// bump-on-add — sets the absolute value the admin typed.
export async function updateSetComponentQuantity(setId: number, itemId: number, quantity: number): Promise<void> {
	await db
		.update(setItems)
		.set({ quantity })
		.where(and(eq(setItems.setId, setId), eq(setItems.itemId, itemId)));
}

export async function removeSetComponent(setId: number, itemId: number): Promise<void> {
	await db.delete(setItems).where(and(eq(setItems.setId, setId), eq(setItems.itemId, itemId)));
}
