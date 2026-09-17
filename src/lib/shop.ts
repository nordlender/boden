// Customer-facing catalogue queries — the schema-v3 equivalent of what
// worktree-navbar-homepage's index.astro/[slug].astro queried directly
// against the old items-own-everything model. Deliberately a new file
// rather than additions to src/lib/wizard.ts (that file is owned by an
// already-merged, out-of-scope PR): the query shape below mirrors
// wizard.ts's getWizardItems (items -> product -> subcategory ->
// attributeKeys, join items -> attributeValues -> attribute), but is scoped
// to what a shopper should see rather than the admin wizard's full set.
import { db } from '../db/client';
import { reservedQuantitiesByItem } from './stock';

export interface ShopAttribute {
	key: string;
	value: string;
}

export interface ShopItem {
	id: number;
	// Note: item.name is an internal/admin-only label (see schema.ts's
	// comment on items.name) — never rendered to a customer. It's kept here
	// only as a last-resort alt-text fallback.
	name: string;
	imageUrl: string | null;
	inStock: number;
	stockCount: number;
	productId: number;
	productSlug: string;
	productTitle: string;
	categoryName: string | null;
	subcategoryName: string | null;
	attributes: ShopAttribute[];
}

export interface ShopProductLink {
	id: number;
	label: string;
	url: string;
}

export interface ShopProduct {
	id: number;
	slug: string;
	title: string;
	description: string | null;
	thumbnailImageUrl: string | null;
	categoryName: string | null;
	subcategoryName: string | null;
	links: ShopProductLink[];
	// Ordered attribute key names from the product's template — used to sort
	// each item's flat attribute values consistently and to know whether a
	// per-variant attribute list should render at all.
	attributeKeyOrder: string[];
	items: ShopItem[];
}

export function sortAttributes(
	values: { value: string; attribute: { name: string; sortOrder: number } }[],
): ShopAttribute[] {
	return values
		.slice()
		.sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
		.map((v) => ({ key: v.attribute.name, value: v.value }));
}

interface ItemLike {
	id: number;
	name: string;
	imageUrl: string | null;
	stockCount: number;
	attributeValues: { value: string; attribute: { name: string; sortOrder: number } }[];
}

interface ProductLike {
	id: number;
	slug: string;
	title: string;
	thumbnailImageUrl: string | null;
	category?: { name: string } | null;
	subcategory?: { name: string } | null;
}

// Shared by getShopItems (product nested per-row) and getShopProductBySlug
// (one product, many sibling items) — kept as one mapping so the two never
// drift on what a "shop item" looks like.
function toShopItem(item: ItemLike, product: ProductLike, reserved: Map<number, number>): ShopItem {
	return {
		id: item.id,
		name: item.name,
		imageUrl: item.imageUrl ?? product.thumbnailImageUrl,
		inStock: item.stockCount - (reserved.get(item.id) ?? 0),
		stockCount: item.stockCount,
		productId: product.id,
		productSlug: product.slug,
		productTitle: product.title,
		categoryName: product.category?.name ?? null,
		subcategoryName: product.subcategory?.name ?? null,
		attributes: sortAttributes(item.attributeValues),
	};
}

// Homepage listing: every non-archived item whose product is published.
// Items with no product (still mid-wizard, per wizard.ts's "unassigned"
// bucket) never have a product to be published, so they're excluded
// implicitly by the `product.status === 'published'` filter below.
export async function getShopItems(): Promise<ShopItem[]> {
	const rows = await db.query.items.findMany({
		where: (t, { eq }) => eq(t.archived, false),
		orderBy: (t, { asc }) => asc(t.id),
		with: {
			product: {
				with: { category: true, subcategory: true },
			},
			attributeValues: { with: { attribute: true } },
		},
	});

	const published = rows.filter(
		(row): row is typeof row & { product: NonNullable<typeof row.product> } =>
			row.product?.status === 'published',
	);
	const reserved = await reservedQuantitiesByItem(published.map((row) => row.id));

	return published.map((row) => toShopItem(row, row.product, reserved));
}

// Every published product's slug with at least a wizard-created row —
// used by /products/[slug].astro's getStaticPaths (this app prerenders the
// catalogue/product pages at build time, see astro.config.mjs).
export async function getPublishedProductSlugs(): Promise<string[]> {
	const rows = await db.query.products.findMany({
		where: (t, { eq }) => eq(t.status, 'published'),
		columns: { slug: true },
	});
	return rows.map((row) => row.slug);
}

// Product detail page: the product plus its non-archived sibling items,
// each labeled by its own flat attribute values (schema v3 has no
// per-option-value images or mutually-exclusive option groups — see this
// PR's description for the ProductOptions simplification this implies).
// Returns null for a hidden/missing product so the page can 404.
export async function getShopProductBySlug(slug: string): Promise<ShopProduct | null> {
	const product = await db.query.products.findFirst({
		where: (t, { eq }) => eq(t.slug, slug),
		with: {
			category: true,
			subcategory: true,
			links: true,
			attributeKeys: { orderBy: (t, { asc }) => asc(t.sortOrder) },
			items: {
				with: { attributeValues: { with: { attribute: true } } },
			},
		},
	});

	if (!product || product.status !== 'published') return null;

	const visibleItems = product.items.filter((item) => !item.archived);
	const reserved = await reservedQuantitiesByItem(visibleItems.map((item) => item.id));

	const items: ShopItem[] = visibleItems.map((item) => toShopItem(item, product, reserved));

	return {
		id: product.id,
		slug: product.slug,
		title: product.title,
		description: product.description,
		thumbnailImageUrl: product.thumbnailImageUrl,
		categoryName: product.category?.name ?? null,
		subcategoryName: product.subcategory?.name ?? null,
		links: product.links,
		attributeKeyOrder: product.attributeKeys.map((key) => key.name),
		items,
	};
}

// ---------------------------------------------------------------------------
// Sets (GitHub issue #61) — a bundle of concrete items. Mirrors the shape of
// getShopItems/getShopProductBySlug above, but a set has no stock of its
// own: "in stock" here is the date-agnostic figure (today's stockCount
// minus what's currently reserved, via src/lib/stock.ts — same convention
// ShopItem.inStock already uses), floor-divided by each constituent item's
// per-kit quantity, minimum across all of them. The date-aware version of
// this same computation (against a chosen reservation date range) is
// src/lib/sets.ts's getSetAvailability, which composes over
// src/lib/reservation.ts instead of stock.ts.
// ---------------------------------------------------------------------------

export interface ShopSetItem {
	itemId: number;
	name: string;
	imageUrl: string | null;
	productSlug: string | null;
	productTitle: string;
	// How many of this item one kit needs.
	quantity: number;
	archived: boolean;
}

export interface ShopSet {
	id: number;
	slug: string;
	title: string;
	description: string | null;
	thumbnailImageUrl: string | null;
	// Whole kits available right now — 0 whenever any constituent item is
	// archived, same "a kit is atomic" rule as getSetAvailability.
	inStock: number;
	items: ShopSetItem[];
}

interface SetLike {
	id: number;
	slug: string;
	title: string;
	description: string | null;
	thumbnailImageUrl: string | null;
	setItems: {
		quantity: number;
		item: {
			id: number;
			name: string;
			imageUrl: string | null;
			stockCount: number;
			archived: boolean;
			product: { slug: string; title: string; thumbnailImageUrl: string | null } | null;
		};
	}[];
}

function toShopSet(set: SetLike, reserved: Map<number, number>): ShopSet {
	const hasArchivedItem = set.setItems.some((si) => si.item.archived);
	const inStock = hasArchivedItem
		? 0
		: Math.max(
				0,
				Math.min(
					...set.setItems.map((si) => Math.floor((si.item.stockCount - (reserved.get(si.item.id) ?? 0)) / si.quantity)),
				),
			);

	return {
		id: set.id,
		slug: set.slug,
		title: set.title,
		description: set.description,
		thumbnailImageUrl: set.thumbnailImageUrl,
		inStock,
		items: set.setItems.map((si) => ({
			itemId: si.item.id,
			name: si.item.name,
			imageUrl: si.item.imageUrl ?? si.item.product?.thumbnailImageUrl ?? null,
			productSlug: si.item.product?.slug ?? null,
			productTitle: si.item.product?.title ?? si.item.name,
			quantity: si.quantity,
			archived: si.item.archived,
		})),
	};
}

// Every published set's slug — used by /sets/[slug].astro's getStaticPaths
// (this app prerenders the catalogue, see astro.config.mjs), same pattern
// as getPublishedProductSlugs above.
export async function getPublishedSetSlugs(): Promise<string[]> {
	const rows = await db.query.sets.findMany({
		where: (t, { eq }) => eq(t.status, 'published'),
		columns: { slug: true },
	});
	return rows.map((row) => row.slug);
}

// /sets listing page: every published set, regardless of whether it
// currently has any kits in stock (an out-of-stock kit still shows, same
// convention as an out-of-stock item on the homepage grid).
export async function getShopSets(): Promise<ShopSet[]> {
	const rows = await db.query.sets.findMany({
		where: (t, { eq }) => eq(t.status, 'published'),
		orderBy: (t, { asc }) => asc(t.id),
		with: {
			setItems: {
				with: { item: { with: { product: true } } },
			},
		},
	});

	const allItemIds = rows.flatMap((row) => row.setItems.map((si) => si.item.id));
	const reserved = await reservedQuantitiesByItem(allItemIds);

	return rows.map((row) => toShopSet(row, reserved));
}

// /sets/[slug] detail page. Returns null for a hidden/missing set so the
// page can 404, same convention as getShopProductBySlug.
export async function getShopSetBySlug(slug: string): Promise<ShopSet | null> {
	const set = await db.query.sets.findFirst({
		where: (t, { eq }) => eq(t.slug, slug),
		with: {
			setItems: {
				with: { item: { with: { product: true } } },
			},
		},
	});

	if (!set || set.status !== 'published') return null;

	const reserved = await reservedQuantitiesByItem(set.setItems.map((si) => si.item.id));
	return toShopSet(set, reserved);
}
