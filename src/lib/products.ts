import { db } from '../db/client';
import { categories, subcategories, products, productLinks, productAttributeKeys, items, itemAttributeValues } from '../db/schema';
import { eq, max } from 'drizzle-orm';

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
	// Split on runs of non-alphanumerics and re-join: leading/trailing/repeated
	// separators fall out as empty segments, so no backtracking-prone trim regex.
	const base = input
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.join('-');
	return base || 'product';
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Same collision-avoidance shape as wizard.ts's uniqueItemSlug/setWizard.ts's
// equivalent. Runs on the caller's transaction so the check and the write
// that follows can't interleave with another save.
function uniqueProductSlug(tx: Tx, title: string, excludeId?: number): string {
	const base = slugify(title);
	let candidate = base;
	let suffix = 2;
	for (;;) {
		const existing = tx.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).get();
		if (!existing || existing.id === excludeId) return candidate;
		candidate = `${base}-${suffix++}`;
	}
}

// Bad user input the routes should surface as a 400, not a 500.
export class ProductInputError extends Error {}

// A subcategory only makes sense under its own category, and both ids must
// exist — the form's client-side filter is just a convenience.
function assertValidClassification(tx: Tx, categoryId: number | null | undefined, subcategoryId: number | null | undefined): void {
	if (categoryId != null && !tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get()) {
		throw new ProductInputError('Unknown category');
	}
	if (subcategoryId == null) return;
	const subcategory = tx.select({ categoryId: subcategories.categoryId }).from(subcategories).where(eq(subcategories.id, subcategoryId)).get();
	if (!subcategory) throw new ProductInputError('Unknown sub-category');
	if (subcategory.categoryId !== categoryId) throw new ProductInputError('Sub-category does not belong to the chosen category');
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
	status?: 'hidden' | 'published';
	thumbnailImageUrl?: string | null;
	links: ProductLinkInput[];
	// Attribute-key template rows, by name — see docs/schema.md's
	// productAttributeKeys. Order given here becomes sortOrder.
	attributeKeys: string[];
	// Names of the attribute keys the shopper picks between (see schema.ts's
	// productAttributeKeys.isVariant). May name existing or newly-added keys;
	// names matching no key are ignored. Optional so callers that don't care
	// leave the current selection untouched.
	variantAttributeKeys?: string[];
}

export async function createProduct(input: ProductInput): Promise<number> {
	const attributeKeyNames = dedupeKeyNames(input.attributeKeys);

	return db.transaction((tx) => {
		assertValidClassification(tx, input.categoryId, input.subcategoryId);
		const slug = uniqueProductSlug(tx, input.title);
		const created = tx
			.insert(products)
			.values({
				slug,
				title: input.title,
				description: input.description?.trim() || null,
				categoryId: input.categoryId ?? null,
				subcategoryId: input.subcategoryId ?? null,
				status: input.status ?? 'hidden',
				thumbnailImageUrl: input.thumbnailImageUrl?.trim() || null,
			})
			.returning({ id: products.id })
			.get();

		insertLinks(tx, created.id, input.links);
		insertAttributeKeys(tx, created.id, attributeKeyNames);
		applyVariantKeys(tx, created.id, input.variantAttributeKeys);

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
	const attributeKeyNames = dedupeKeyNames(input.attributeKeys);

	db.transaction((tx) => {
		assertValidClassification(tx, input.categoryId, input.subcategoryId);
		const slug = uniqueProductSlug(tx, input.title, id);
		tx.update(products)
			.set({
				slug,
				title: input.title,
				description: input.description?.trim() || null,
				categoryId: input.categoryId ?? null,
				subcategoryId: input.subcategoryId ?? null,
				status: input.status ?? 'hidden',
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
		insertAttributeKeys(tx, id, newNames);
		applyVariantKeys(tx, id, input.variantAttributeKeys);
	});
}

// Unlike adding keys, flagging is freely reversible (no item data is
// touched), so this runs on edit too: exactly the named keys end up flagged.
function applyVariantKeys(tx: Tx, productId: number, names: string[] | undefined): void {
	if (!names) return;
	const wanted = new Set(names.map((name) => name.trim()).filter(Boolean));
	const keys = tx.select({ id: productAttributeKeys.id, name: productAttributeKeys.name }).from(productAttributeKeys).where(eq(productAttributeKeys.productId, productId)).all();
	for (const key of keys) {
		tx.update(productAttributeKeys).set({ isVariant: wanted.has(key.name) }).where(eq(productAttributeKeys.id, key.id)).run();
	}
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

function insertLinks(tx: Tx, productId: number, links: ProductLinkInput[]): void {
	const rows = links
		.map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
		.filter((link) => link.label && link.url);
	if (rows.length === 0) return;
	tx.insert(productLinks)
		.values(rows.map((link) => ({ productId, label: link.label, url: link.url })))
		.run();
}

// Appends keys after the product's current last sortOrder and, same fan-out
// rule as wizard.ts's getOrCreateAttributeKey, gives every item already on
// the product a blank value for each — otherwise they'd silently be missing a
// field the template now defines. On create there are no items yet, so the
// fan-out is a no-op.
function insertAttributeKeys(tx: Tx, productId: number, names: string[]): void {
	if (names.length === 0) return;

	const last = tx
		.select({ value: max(productAttributeKeys.sortOrder) })
		.from(productAttributeKeys)
		.where(eq(productAttributeKeys.productId, productId))
		.get();
	const startOrder = last?.value == null ? 0 : last.value + 1;

	const created = tx
		.insert(productAttributeKeys)
		.values(names.map((name, index) => ({ productId, name, sortOrder: startOrder + index })))
		.returning({ id: productAttributeKeys.id })
		.all();

	const siblingItems = tx.select({ id: items.id }).from(items).where(eq(items.productId, productId)).all();
	if (siblingItems.length === 0) return;

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
	status: 'hidden' | 'published';
	thumbnailImageUrl: string | null;
	links: { id: number; label: string; url: string }[];
	attributeKeys: { id: number; name: string; isVariant: boolean }[];
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
		status: product.status,
		thumbnailImageUrl: product.thumbnailImageUrl,
		links: product.links.map((link) => ({ id: link.id, label: link.label, url: link.url })),
		attributeKeys: product.attributeKeys.map((key) => ({ id: key.id, name: key.name, isVariant: key.isVariant })),
	};
}

export interface ProductListRow {
	id: number;
	title: string;
	status: 'hidden' | 'published';
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
		status: row.status,
		categoryName: row.category?.name ?? null,
		subcategoryName: row.subcategory?.name ?? null,
	}));
}
