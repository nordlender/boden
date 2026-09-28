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
	// Quantity an admin has pulled out for service/quarantine (issue #62) —
	// excluded from inStock the same way reserved quantity is.
	serviceQuantity: number;
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
		inStock: item.stockCount - item.serviceQuantity - (reserved.get(item.id) ?? 0),
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

export interface ShopGridProduct {
	productId: number;
	productSlug: string;
	productTitle: string;
	// Representative item's image/id — see groupShopItemsByProduct for how
	// it's picked. Used for the tile's image and the `?item=<id>` link that
	// preselects a variant on /products/[slug].
	representativeItemId: number;
	imageUrl: string | null;
	categoryName: string | null;
	subcategoryName: string | null;
	// Sum of every sibling item's inStock — interim approach (issue #64
	// still owns the stock badge's final design), so this effectively reads
	// "in stock if any item in the group is available."
	inStock: number;
}

// Collapses getShopItems()'s one-row-per-item rows into one row per
// product, for the homepage grid — a product with N size/color variants
// should render as one tile, not N. Preserves the input's ordering (first
// occurrence of each productId), since getShopItems already orders by item
// id ascending.
export function groupShopItemsByProduct(items: ShopItem[]): ShopGridProduct[] {
	const order: number[] = [];
	const groups = new Map<number, ShopItem[]>();
	for (const item of items) {
		if (!groups.has(item.productId)) {
			order.push(item.productId);
			groups.set(item.productId, []);
		}
		groups.get(item.productId)!.push(item);
	}

	return order.map((productId) => {
		const group = groups.get(productId)!;
		// Representative = first in-stock item, falling back to the first
		// item in the group if none are in stock.
		const representative = group.find((item) => item.inStock > 0) ?? group[0];
		return {
			productId,
			productSlug: representative.productSlug,
			productTitle: representative.productTitle,
			representativeItemId: representative.id,
			imageUrl: representative.imageUrl,
			categoryName: representative.categoryName,
			subcategoryName: representative.subcategoryName,
			inStock: group.reduce((sum, item) => sum + item.inStock, 0),
		};
	});
}

// The homepage grid's data source: one row per published product,
// collapsing its item variants into a single representative tile.
export async function getShopGridProducts(): Promise<ShopGridProduct[]> {
	const items = await getShopItems();
	return groupShopItemsByProduct(items);
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
