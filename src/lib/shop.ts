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
import { computeSetAvailability, getSetChildrenDetailedBulk, getSetComponentDisplayBulk, type SetChildDetail, type SetComponentDisplay } from './sets';

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

// A set's variant, shaped like ShopItem (same product-level fields) but
// resolving to a bundle of components rather than being one physical thing
// — see src/db/schema.ts's `sets` comment. `inStock`/`stockCount` are the
// most sets orderable right now/ever, capped by whichever component has the
// least room (src/lib/sets.ts's computeSetAvailability) — a set has no
// stock of its own. Unlike ShopItem, there's no `attributes` here — a set
// has no attribute template of its own (see schema.ts's `sets.label`
// comment): `label` is the admin's own short, manually-typed text
// distinguishing this set from its siblings, and `componentDisplay` is the
// automatically-derived "what this set includes" breakdown, sourced from
// the components' own real attribute values (src/lib/sets.ts's
// getSetComponentDisplayBulk).
export interface ShopSet {
	id: number;
	name: string;
	label: string | null;
	imageUrl: string | null;
	inStock: number;
	stockCount: number;
	productId: number;
	productSlug: string;
	productTitle: string;
	categoryName: string | null;
	subcategoryName: string | null;
	componentDisplay: SetComponentDisplay[];
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
	// each item's/set's flat attribute values consistently and to know
	// whether a per-variant attribute list should render at all.
	attributeKeyOrder: string[];
	items: ShopItem[];
	sets: ShopSet[];
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

// Shared by getShopSets (product nested per-row) and getShopProductBySlug
// (one product, many sibling sets) — mirrors toShopItem above.
function toShopSet(
	set: { id: number; name: string; label: string | null; imageUrl: string | null },
	product: ProductLike,
	children: SetChildDetail[],
	componentDisplay: SetComponentDisplay[],
	reserved: Map<number, number>,
): ShopSet {
	const { stockCount, inStock } = computeSetAvailability(children, reserved);
	return {
		id: set.id,
		name: set.name,
		label: set.label,
		imageUrl: set.imageUrl ?? product.thumbnailImageUrl,
		inStock,
		stockCount,
		productId: product.id,
		productSlug: product.slug,
		productTitle: product.title,
		categoryName: product.category?.name ?? null,
		subcategoryName: product.subcategory?.name ?? null,
		componentDisplay,
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

// Same idea as getShopItems, for sets — every non-archived set whose
// product is published.
export async function getShopSets(): Promise<ShopSet[]> {
	const rows = await db.query.sets.findMany({
		where: (t, { eq }) => eq(t.archived, false),
		orderBy: (t, { asc }) => asc(t.id),
		with: {
			product: {
				with: { category: true, subcategory: true },
			},
		},
	});

	const published = rows.filter(
		(row): row is typeof row & { product: NonNullable<typeof row.product> } => row.product?.status === 'published',
	);

	const setIds = published.map((row) => row.id);
	const [childrenBySet, componentDisplayBySet] = await Promise.all([
		getSetChildrenDetailedBulk(setIds),
		getSetComponentDisplayBulk(setIds),
	]);
	const allChildItemIds = [...new Set([...childrenBySet.values()].flat().map((child) => child.itemId))];
	const reserved = await reservedQuantitiesByItem(allChildItemIds);

	return published.map((row) =>
		toShopSet(row, row.product, childrenBySet.get(row.id) ?? [], componentDisplayBySet.get(row.id) ?? [], reserved),
	);
}

export interface ShopGridProduct {
	productId: number;
	productSlug: string;
	productTitle: string;
	// Representative item's image/id — see groupShopItemsByProduct for how
	// it's picked. Used for the tile's image and the `?item=<id>` link that
	// preselects a variant on /products/[slug].
	representativeItemId: number | null;
	// Set only for a product whose variants are sets (a product's variants are
	// all items or all sets, never a mix — see VariantPicker.astro). Exactly
	// one of representativeItemId / representativeSetId is non-null.
	representativeSetId: number | null;
	imageUrl: string | null;
	categoryName: string | null;
	subcategoryName: string | null;
	// Sum of every sibling variant's inStock — interim approach (issue #64
	// still owns the stock badge's final design), so this effectively reads
	// "in stock if any variant in the group is available."
	inStock: number;
}

// What both an item and a set variant provide to the grid — ShopItem and
// ShopSet each satisfy this structurally, so one grouping routine serves both.
type GridVariant = Pick<
	ShopItem,
	'id' | 'productId' | 'productSlug' | 'productTitle' | 'imageUrl' | 'categoryName' | 'subcategoryName' | 'inStock'
>;

// Collapses one-row-per-variant rows into one row per product, for the
// homepage grid — a product with N size/color variants should render as one
// tile, not N. Preserves the input's ordering (first occurrence of each
// productId), since getShopItems/getShopSets already order by id ascending.
function groupVariantsByProduct(
	variants: GridVariant[],
): (Omit<ShopGridProduct, 'representativeItemId' | 'representativeSetId'> & { representativeId: number })[] {
	const order: number[] = [];
	const groups = new Map<number, GridVariant[]>();
	for (const variant of variants) {
		if (!groups.has(variant.productId)) {
			order.push(variant.productId);
			groups.set(variant.productId, []);
		}
		groups.get(variant.productId)!.push(variant);
	}

	return order.map((productId) => {
		const group = groups.get(productId)!;
		// Representative = first in-stock variant, falling back to the first
		// variant in the group if none are in stock.
		const representative = group.find((variant) => variant.inStock > 0) ?? group[0];
		return {
			productId,
			productSlug: representative.productSlug,
			productTitle: representative.productTitle,
			representativeId: representative.id,
			imageUrl: representative.imageUrl,
			categoryName: representative.categoryName,
			subcategoryName: representative.subcategoryName,
			inStock: group.reduce((sum, variant) => sum + variant.inStock, 0),
		};
	});
}

export function groupShopItemsByProduct(items: ShopItem[]): ShopGridProduct[] {
	return groupVariantsByProduct(items).map(({ representativeId, ...tile }) => ({
		...tile,
		representativeItemId: representativeId,
		representativeSetId: null,
	}));
}

export function groupShopSetsByProduct(sets: ShopSet[]): ShopGridProduct[] {
	return groupVariantsByProduct(sets).map(({ representativeId, ...tile }) => ({
		...tile,
		representativeItemId: null,
		representativeSetId: representativeId,
	}));
}

// The homepage grid's data source: one row per published product,
// collapsing its variants into a single representative tile. Item products
// first (by item id), then set-only products (by set id). A product that
// somehow has both is shown as an item product — the same "items unless
// there are none" rule VariantPicker.astro applies.
export async function getShopGridProducts(): Promise<ShopGridProduct[]> {
	const [items, sets] = await Promise.all([getShopItems(), getShopSets()]);
	const itemTiles = groupShopItemsByProduct(items);
	const itemProductIds = new Set(itemTiles.map((tile) => tile.productId));
	const setTiles = groupShopSetsByProduct(sets).filter((tile) => !itemProductIds.has(tile.productId));
	return [...itemTiles, ...setTiles];
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
			sets: true,
		},
	});

	if (!product || product.status !== 'published') return null;

	const visibleItems = product.items.filter((item) => !item.archived);
	const reserved = await reservedQuantitiesByItem(visibleItems.map((item) => item.id));
	const items: ShopItem[] = visibleItems.map((item) => toShopItem(item, product, reserved));

	const visibleSets = product.sets.filter((set) => !set.archived);
	const setIds = visibleSets.map((set) => set.id);
	const [childrenBySet, componentDisplayBySet] = await Promise.all([
		getSetChildrenDetailedBulk(setIds),
		getSetComponentDisplayBulk(setIds),
	]);
	const allChildItemIds = [...new Set([...childrenBySet.values()].flat().map((child) => child.itemId))];
	const reservedForSets = await reservedQuantitiesByItem(allChildItemIds);
	const sets: ShopSet[] = visibleSets.map((set) =>
		toShopSet(set, product, childrenBySet.get(set.id) ?? [], componentDisplayBySet.get(set.id) ?? [], reservedForSets),
	);

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
		sets,
	};
}
