import { db } from '../db/client';
import { items, productAttributeKeys, itemAttributeValues, orderItems, orders } from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

export interface WizardAttribute {
	key: string;
	value: string;
}

export interface WizardItem {
	id: number;
	name: string;
	imageUrl: string | null;
	inStock: number;
	totalStock: number;
	productId: number | null;
	productTitle?: string;
	subCategory?: string;
	description?: string | null;
	attributes: WizardAttribute[];
	// The item's product currently has zero productAttributeKeys rows —
	// schema_v3.md's "UI cue for a product with no attribute template yet".
	missingAttributeTemplate: boolean;
}

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return base || 'item';
}

async function uniqueItemSlug(name: string): Promise<string> {
	const base = slugify(name);
	let candidate = base;
	let suffix = 2;
	// Small table — a loop of existence checks is fine, no need for a
	// cleverer collision-avoidance scheme.
	while (await db.query.items.findFirst({ where: (t, { eq }) => eq(t.slug, candidate) })) {
		candidate = `${base}-${suffix++}`;
	}
	return candidate;
}

async function reservedQuantitiesByItem(itemIds: number[]): Promise<Map<number, number>> {
	if (itemIds.length === 0) return new Map();
	const rows = await db
		.select({
			itemId: orderItems.itemId,
			reserved: sql<number>`sum(${orderItems.requestedQuantity})`.as('reserved'),
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(and(inArray(orderItems.itemId, itemIds), inArray(orders.status, ['requested', 'active'])))
		.groupBy(orderItems.itemId);
	return new Map(rows.map((row) => [row.itemId, row.reserved]));
}

export async function getWizardItems(): Promise<{ unassigned: WizardItem[]; assigned: WizardItem[] }> {
	const rows = await db.query.items.findMany({
		where: (t, { eq }) => eq(t.archived, false),
		orderBy: (t, { asc }) => asc(t.id),
		with: {
			product: {
				with: {
					subcategory: true,
					attributeKeys: true,
				},
			},
			attributeValues: {
				with: { attribute: true },
			},
		},
	});

	const reserved = await reservedQuantitiesByItem(rows.map((row) => row.id));

	const wizardItems: WizardItem[] = rows.map((row) => ({
		id: row.id,
		name: row.name,
		imageUrl: row.imageUrl,
		inStock: row.stockCount - (reserved.get(row.id) ?? 0),
		totalStock: row.stockCount,
		productId: row.productId,
		productTitle: row.product?.title,
		subCategory: row.product?.subcategory?.name,
		description: row.product?.description ?? null,
		attributes: row.attributeValues.map((v) => ({ key: v.attribute.name, value: v.value })),
		missingAttributeTemplate: row.productId !== null && (row.product?.attributeKeys.length ?? 0) === 0,
	}));

	return {
		unassigned: wizardItems.filter((item) => item.productId === null),
		assigned: wizardItems.filter((item) => item.productId !== null),
	};
}

export async function listProductOptions(): Promise<{ id: number; title: string }[]> {
	return db.query.products.findMany({
		columns: { id: true, title: true },
		orderBy: (t, { asc }) => asc(t.title),
	});
}

export async function createItem(input: { name: string; imageUrl?: string | null; stockCount?: number }): Promise<number> {
	const slug = await uniqueItemSlug(input.name);
	const [created] = await db
		.insert(items)
		.values({
			name: input.name,
			slug,
			imageUrl: input.imageUrl?.trim() || null,
			stockCount: input.stockCount ?? 1,
		})
		.returning({ id: items.id });
	return created.id;
}

export async function archiveItems(itemIds: number[]): Promise<void> {
	if (itemIds.length === 0) return;
	await db.update(items).set({ archived: true }).where(inArray(items.id, itemIds));
}

// schema_v3.md Work item: "'Set product' reassignment must keep attribute
// values consistent" — one transaction: drop the old product's values,
// point the items at the new product, then stub in a blank value for every
// field the new product's template defines.
//
// Only items whose productId is actually *changing* get their attribute
// values wiped and re-blanked. An item already on `productId` (e.g. a
// misclick, or an explicit re-assign to the same product) is left alone —
// its existing values are already correct for that product's template, and
// wiping them would be silent, uninvited data loss.
export async function setItemsProduct(itemIds: number[], productId: number): Promise<void> {
	if (itemIds.length === 0) return;
	db.transaction((tx) => {
		const current = tx
			.select({ id: items.id, productId: items.productId })
			.from(items)
			.where(inArray(items.id, itemIds))
			.all();

		const changingIds = current.filter((item) => item.productId !== productId).map((item) => item.id);

		tx.update(items).set({ productId }).where(inArray(items.id, itemIds)).run();

		if (changingIds.length === 0) return;

		tx.delete(itemAttributeValues).where(inArray(itemAttributeValues.itemId, changingIds)).run();

		const keys = tx
			.select({ id: productAttributeKeys.id })
			.from(productAttributeKeys)
			.where(eq(productAttributeKeys.productId, productId))
			.all();

		if (keys.length > 0) {
			tx.insert(itemAttributeValues)
				.values(changingIds.flatMap((itemId) => keys.map((key) => ({ itemId, attributeId: key.id, value: '' }))))
				.run();
		}
	});
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Looks up the product's attribute key by name, creating it and fanning out
// a blank value to every existing item of the product if it doesn't exist
// yet — schema_v3.md Work item "fan out new template fields to existing
// items". Shared by the single-item and bulk attribute editing entry points
// below so the fan-out logic can't drift between the two.
function getOrCreateAttributeKey(tx: Tx, productId: number, trimmedKey: string): number {
	const existing = tx
		.select({ id: productAttributeKeys.id })
		.from(productAttributeKeys)
		.where(and(eq(productAttributeKeys.productId, productId), eq(productAttributeKeys.name, trimmedKey)))
		.get();
	if (existing) return existing.id;

	const created = tx
		.insert(productAttributeKeys)
		.values({ productId, name: trimmedKey })
		.returning({ id: productAttributeKeys.id })
		.get();

	const siblingItems = tx.select({ id: items.id }).from(items).where(eq(items.productId, productId)).all();
	if (siblingItems.length > 0) {
		tx.insert(itemAttributeValues)
			.values(siblingItems.map((sibling) => ({ itemId: sibling.id, attributeId: created.id, value: '' })))
			.run();
	}

	return created.id;
}

// schema_v3.md Work item: "attribute editing entry points" (single-item).
export async function setItemAttributeValue(itemId: number, key: string, value: string): Promise<void> {
	const trimmedKey = key.trim();
	if (!trimmedKey) throw new Error('Attribute key is required');

	const item = await db.query.items.findFirst({ where: (t, { eq }) => eq(t.id, itemId) });
	if (!item || item.productId === null) throw new Error('Item has no product assigned');
	const productId = item.productId;

	db.transaction((tx) => {
		const attributeId = getOrCreateAttributeKey(tx, productId, trimmedKey);

		tx.insert(itemAttributeValues)
			.values({ itemId, attributeId, value })
			.onConflictDoUpdate({
				target: [itemAttributeValues.itemId, itemAttributeValues.attributeId],
				set: { value },
			})
			.run();
	});
}

// null return means "no single shared product" — either the items span more
// than one product, or none of them are assigned to a product at all. Both
// are treated the same by the bulk-attributes caller: nothing to attach the
// values to.
async function sharedProductId(itemIds: number[]): Promise<number | null> {
	if (itemIds.length === 0) return null;
	const rows = await db.select({ productId: items.productId }).from(items).where(inArray(items.id, itemIds));
	const productIds = new Set(rows.map((row) => row.productId));
	if (productIds.size !== 1) return null;
	const [only] = productIds;
	return only ?? null;
}

export type BulkAttributeResult = { ok: true } | { ok: false; error: 'no_shared_product' };

// schema_v3.md Work item: "attribute editing entry points" (bulk). Applies
// every key/value pair to every selected item, after confirming they all
// share one product (i.e. one attribute template) — the caller is
// responsible for surfacing `no_shared_product` as the doc's "warning...
// disable every control except Cancel/Close".
export async function setBulkAttributeValues(itemIds: number[], values: WizardAttribute[]): Promise<BulkAttributeResult> {
	const productId = await sharedProductId(itemIds);
	if (productId === null) return { ok: false, error: 'no_shared_product' };

	db.transaction((tx) => {
		for (const { key, value } of values) {
			const trimmedKey = key.trim();
			if (!trimmedKey) continue;

			const attributeId = getOrCreateAttributeKey(tx, productId, trimmedKey);

			tx.insert(itemAttributeValues)
				.values(itemIds.map((itemId) => ({ itemId, attributeId, value })))
				.onConflictDoUpdate({
					target: [itemAttributeValues.itemId, itemAttributeValues.attributeId],
					set: { value },
				})
				.run();
		}
	});

	return { ok: true };
}
