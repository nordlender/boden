import { db } from '../db/client';
import { products, productLinks, productAttributeKeys, items, itemAttributeValues } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface CategoryOption {
	id: number;
	name: string;
}

export interface SubcategoryOption {
	id: number;
	categoryId: number;
	name: string;
}

export async function listCategoryOptions(): Promise<CategoryOption[]> {
	return db.query.categories.findMany({
		columns: { id: true, name: true },
		orderBy: (t, { asc }) => asc(t.name),
	});
}

// Small table — loading every subcategory and filtering client-side by
// categoryId (see ProductForm.astro's script) avoids a round trip every
// time the admin changes the category dropdown.
export async function listSubcategoryOptions(): Promise<SubcategoryOption[]> {
	return db.query.subcategories.findMany({
		columns: { id: true, categoryId: true, name: true },
		orderBy: (t, { asc }) => asc(t.name),
	});
}

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '');
	return base || 'product';
}

// Same collision-avoidance shape as wizard.ts's uniqueItemSlug/setWizard.ts's
// equivalent — small table, a loop of existence checks is fine.
async function uniqueProductSlug(title: string, excludeId?: number): Promise<string> {
	const base = slugify(title);
	let candidate = base;
	let suffix = 2;
	for (;;) {
		const existing = await db.query.products.findFirst({ where: (t, { eq }) => eq(t.slug, candidate) });
		if (!existing || existing.id === excludeId) return candidate;
		candidate = `${base}-${suffix++}`;
	}
}

export interface ProductLinkInput {
	label: string;
	url: string;
}

export interface ProductInput {
	title: string;
	description?: string | null;
	categoryId?: number | null;
	subcategoryId?: number | null;
	published?: boolean;
	thumbnailImageUrl?: string | null;
	links: ProductLinkInput[];
	// Attribute-key template rows, by name — see docs/schema.md's
	// productAttributeKeys. Order given here becomes sortOrder.
	attributeKeys: string[];
}

export async function createProduct(input: ProductInput): Promise<number> {
	const slug = await uniqueProductSlug(input.title);
	const attributeKeyNames = dedupeKeyNames(input.attributeKeys);

	return db.transaction((tx) => {
		const created = tx
			.insert(products)
			.values({
				slug,
				title: input.title,
				description: input.description?.trim() || null,
				categoryId: input.categoryId ?? null,
				subcategoryId: input.subcategoryId ?? null,
				published: input.published ?? false,
				thumbnailImageUrl: input.thumbnailImageUrl?.trim() || null,
			})
			.returning({ id: products.id })
			.get();

		insertLinks(tx, created.id, input.links);
		insertAttributeKeys(tx, created.id, attributeKeyNames);

		return created.id;
	});
}

// Attribute keys are additive-only here, same convention wizard.ts's
// getOrCreateAttributeKey already established for the item-attribute
// editors: renaming/removing an existing key would either orphan or
// cascade-delete real item data, so that stays out of scope for this form
// (see PR description). New names fan a blank value out to every existing
// item already on this product, same as getOrCreateAttributeKey.
export async function updateProduct(id: number, input: ProductInput): Promise<void> {
	const slug = await uniqueProductSlug(input.title, id);
	const attributeKeyNames = dedupeKeyNames(input.attributeKeys);

	db.transaction((tx) => {
		tx.update(products)
			.set({
				slug,
				title: input.title,
				description: input.description?.trim() || null,
				categoryId: input.categoryId ?? null,
				subcategoryId: input.subcategoryId ?? null,
				published: input.published ?? false,
				thumbnailImageUrl: input.thumbnailImageUrl?.trim() || null,
				updatedAt: new Date(),
			})
			.where(eq(products.id, id))
			.run();

		tx.delete(productLinks).where(eq(productLinks.productId, id)).run();
		insertLinks(tx, id, input.links);

		const existingKeys = tx
			.select({ name: productAttributeKeys.name })
			.from(productAttributeKeys)
			.where(eq(productAttributeKeys.productId, id))
			.all();
		const existingNames = new Set(existingKeys.map((k) => k.name));
		const newNames = attributeKeyNames.filter((name) => !existingNames.has(name));
		insertAttributeKeysFanningToExistingItems(tx, id, newNames);
	});
}

function dedupeKeyNames(names: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of names) {
		const name = raw.trim();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		result.push(name);
	}
	return result;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function insertLinks(tx: Tx, productId: number, links: ProductLinkInput[]): void {
	const rows = links
		.map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
		.filter((link) => link.label && link.url);
	if (rows.length === 0) return;
	tx.insert(productLinks)
		.values(rows.map((link) => ({ productId, label: link.label, url: link.url })))
		.run();
}

// No existing items to fan out to yet on create — plain insert.
function insertAttributeKeys(tx: Tx, productId: number, names: string[]): void {
	if (names.length === 0) return;
	tx.insert(productAttributeKeys)
		.values(names.map((name, index) => ({ productId, name, sortOrder: index })))
		.run();
}

// Same fan-out rule as wizard.ts's getOrCreateAttributeKey: a new key on a
// product that already has assigned items must give every one of those
// items a blank value for it, or they'd silently be missing a field the
// template now defines.
function insertAttributeKeysFanningToExistingItems(tx: Tx, productId: number, names: string[]): void {
	if (names.length === 0) return;

	const created = tx
		.insert(productAttributeKeys)
		.values(names.map((name) => ({ productId, name })))
		.returning({ id: productAttributeKeys.id })
		.all();

	const siblingItems = tx.select({ id: items.id }).from(items).where(eq(items.productId, productId)).all();
	if (siblingItems.length === 0 || created.length === 0) return;

	tx.insert(itemAttributeValues)
		.values(siblingItems.flatMap((item) => created.map((key) => ({ itemId: item.id, attributeId: key.id, value: '' }))))
		.run();
}

export interface ProductForEdit {
	id: number;
	title: string;
	slug: string;
	description: string | null;
	categoryId: number | null;
	subcategoryId: number | null;
	published: boolean;
	thumbnailImageUrl: string | null;
	links: { id: number; label: string; url: string }[];
	attributeKeys: { id: number; name: string }[];
}

export async function getProductForEdit(id: number): Promise<ProductForEdit | null> {
	const product = await db.query.products.findFirst({
		where: (t, { eq }) => eq(t.id, id),
		with: {
			links: true,
			attributeKeys: { orderBy: (t, { asc }) => asc(t.sortOrder) },
		},
	});
	if (!product) return null;

	return {
		id: product.id,
		title: product.title,
		slug: product.slug,
		description: product.description,
		categoryId: product.categoryId,
		subcategoryId: product.subcategoryId,
		published: product.published,
		thumbnailImageUrl: product.thumbnailImageUrl,
		links: product.links.map((link) => ({ id: link.id, label: link.label, url: link.url })),
		attributeKeys: product.attributeKeys.map((key) => ({ id: key.id, name: key.name })),
	};
}

export interface ProductListRow {
	id: number;
	title: string;
	published: boolean;
	categoryName: string | null;
	subcategoryName: string | null;
}

export async function listProductsForAdmin(): Promise<ProductListRow[]> {
	const rows = await db.query.products.findMany({
		orderBy: (t, { asc }) => asc(t.title),
		with: { category: true, subcategory: true },
	});
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		published: row.published,
		categoryName: row.category?.name ?? null,
		subcategoryName: row.subcategory?.name ?? null,
	}));
}
