import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AstroCookies } from 'astro';
import { getCart, setCart, addToCart, updateCartQuantity, removeFromCart, getCartLines } from '../cart';

// getCartLines joins the cookie cart against the db (src/lib/cart.ts imports
// ../db/client, which itself opens a fixed `./data/rental.db` file that
// doesn't exist in a bare checkout/CI runner) — swap it here for a seeded
// in-memory sqlite db instead. The factory is self-contained (only dynamic
// imports + local variables) because vi.mock factories run once, lazily, the
// first time the mocked module is imported — before any outer-scope `let`
// declared later in this file would be initialized.
vi.mock('../../db/client', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../../db/schema');

  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './src/db/migrations' });

  const [category] = await db.insert(schema.categories).values({ name: 'Ropes', slug: 'ropes' }).returning();
  const [product] = await db
    .insert(schema.products)
    .values({
      slug: 'test-rope',
      title: 'Test Rope',
      categoryId: category.id,
      status: 'published',
      thumbnailImageUrl: '/rope-thumb.jpg',
    })
    .returning();
  const [lengthKey] = await db
    .insert(schema.productAttributeKeys)
    .values({ productId: product.id, name: 'Length' })
    .returning();

  // Deterministic ids: these are the only rows ever inserted into `items` in
  // this fixture, and sqlite autoincrement counters start at 1 per table —
  // item60.id === 1, item70.id === 2, archivedItem.id === 3.
  await db
    .insert(schema.items)
    .values({ productId: product.id, slug: 'test-rope-60m', name: 'Test Rope 60m (internal)', imageUrl: '/rope-60.jpg', stockCount: 5 })
    .returning();
  await db
    .insert(schema.items)
    .values({ productId: product.id, slug: 'test-rope-70m', name: 'Test Rope 70m (internal)', stockCount: 2 })
    .returning();
  await db.insert(schema.items).values({ slug: 'archived-rope', name: 'Archived Rope', stockCount: 3, archived: true }).returning();

  // item4.id === 4 — tied to a 'hidden' product, for asserting getCartLines
  // drops items whose product has been unpublished (not just archived items).
  const [hiddenProduct] = await db
    .insert(schema.products)
    .values({ slug: 'hidden-rope', title: 'Hidden Rope', categoryId: category.id, status: 'hidden' })
    .returning();
  await db.insert(schema.items).values({ productId: hiddenProduct.id, slug: 'hidden-rope-item', name: 'Hidden Rope Item', stockCount: 4 }).returning();

  // item5.id === 5 — two attributes whose sortOrder (Length=0, Color=1) is
  // the reverse of insertion order below, for asserting getCartLines sorts
  // attributes by sortOrder rather than returning them in whatever order the
  // db/query happens to yield.
  const [colorKey] = await db
    .insert(schema.productAttributeKeys)
    .values({ productId: product.id, name: 'Color', sortOrder: 1 })
    .returning();
  await db
    .insert(schema.items)
    .values({ productId: product.id, slug: 'test-rope-80m', name: 'Test Rope 80m (internal)', stockCount: 6 })
    .returning();

  await db.insert(schema.itemAttributeValues).values([
    { itemId: 1, attributeId: lengthKey.id, value: '60m' },
    { itemId: 2, attributeId: lengthKey.id, value: '70m' },
    { itemId: 5, attributeId: colorKey.id, value: 'Red' },
    { itemId: 5, attributeId: lengthKey.id, value: '80m' },
  ]);

  // Sets — same autoincrement-per-table determinism as items above:
  // testSet.id === 1, archivedSet.id === 2, hiddenProductSet.id === 3.
  const [testSet] = await db
    .insert(schema.sets)
    .values({ productId: product.id, slug: 'test-set', name: 'Test Set (internal)' })
    .returning();
  await db.insert(schema.setItems).values([
    { setId: testSet.id, itemId: 1, quantity: 1 },
    { setId: testSet.id, itemId: 2, quantity: 2 },
  ]);
  await db.insert(schema.sets).values({ productId: product.id, slug: 'archived-set', name: 'Archived Set', archived: true });
  await db.insert(schema.sets).values({ productId: hiddenProduct.id, slug: 'hidden-product-set', name: 'Hidden Product Set' });

  return { db };
});

// Minimal fake of the AstroCookies surface cart.ts actually uses: `.get(name)`
// returning `{ value } | undefined`, and `.set(name, value, opts)`. Cast to
// AstroCookies at the call site rather than implementing Astro's much larger
// real interface.
function createFakeCookies() {
  const store = new Map<string, string>();
  return {
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name: string, value: string, _opts?: unknown) {
      store.set(name, value);
    },
  };
}

function asCookies(fake: ReturnType<typeof createFakeCookies>): AstroCookies {
  return fake as unknown as AstroCookies;
}

describe('cart', () => {
  let fake: ReturnType<typeof createFakeCookies>;
  let cookies: AstroCookies;

  beforeEach(() => {
    fake = createFakeCookies();
    cookies = asCookies(fake);
  });

  it('getCart returns [] when the cart cookie is missing', () => {
    expect(getCart(cookies)).toEqual([]);
  });

  it('getCart returns [] for an empty-string cookie value', () => {
    fake.set('cart', '');
    expect(getCart(cookies)).toEqual([]);
  });

  it('getCart returns [] and does not throw on malformed JSON', () => {
    fake.set('cart', '{not valid json');
    expect(getCart(cookies)).toEqual([]);
  });

  it('setCart followed by getCart round-trips the cart contents', () => {
    const cart = [
      { itemId: 1, quantity: 2 },
      { itemId: 5, quantity: 1 },
    ];
    setCart(cookies, cart);
    expect(getCart(cookies)).toEqual(cart);
  });

  it('addToCart adds a new item entry to an empty cart', () => {
    addToCart(cookies, { itemId: 42, quantity: 3 });
    expect(getCart(cookies)).toEqual([{ itemId: 42, quantity: 3 }]);
  });

  it('addToCart adds a new set entry to an empty cart', () => {
    addToCart(cookies, { setId: 1, quantity: 2 });
    expect(getCart(cookies)).toEqual([{ setId: 1, quantity: 2 }]);
  });

  it('addToCart increments quantity for an existing itemId rather than duplicating it', () => {
    addToCart(cookies, { itemId: 42, quantity: 3 });
    addToCart(cookies, { itemId: 42, quantity: 2 });
    expect(getCart(cookies)).toEqual([{ itemId: 42, quantity: 5 }]);
  });

  it('addToCart increments quantity for an existing setId rather than duplicating it', () => {
    addToCart(cookies, { setId: 1, quantity: 1 });
    addToCart(cookies, { setId: 1, quantity: 2 });
    expect(getCart(cookies)).toEqual([{ setId: 1, quantity: 3 }]);
  });

  it('keeps an item entry and a set entry with the same numeric id as separate lines', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    addToCart(cookies, { setId: 1, quantity: 1 });
    expect(getCart(cookies)).toEqual([
      { itemId: 1, quantity: 1 },
      { setId: 1, quantity: 1 },
    ]);
  });

  it('addToCart keeps separate entries for different itemIds', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    addToCart(cookies, { itemId: 2, quantity: 4 });
    addToCart(cookies, { itemId: 1, quantity: 1 });
    expect(getCart(cookies)).toEqual([
      { itemId: 1, quantity: 2 },
      { itemId: 2, quantity: 4 },
    ]);
  });

  it('setCart persists an empty cart', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    setCart(cookies, []);
    expect(getCart(cookies)).toEqual([]);
  });
});

describe('updateCartQuantity', () => {
  let fake: ReturnType<typeof createFakeCookies>;
  let cookies: AstroCookies;

  beforeEach(() => {
    fake = createFakeCookies();
    cookies = asCookies(fake);
  });

  it('sets the quantity for an existing item entry (not additive, unlike addToCart)', () => {
    addToCart(cookies, { itemId: 1, quantity: 2 });
    updateCartQuantity(cookies, { itemId: 1 }, 5);
    expect(getCart(cookies)).toEqual([{ itemId: 1, quantity: 5 }]);
  });

  it('sets the quantity for an existing set entry', () => {
    addToCart(cookies, { setId: 1, quantity: 2 });
    updateCartQuantity(cookies, { setId: 1 }, 5);
    expect(getCart(cookies)).toEqual([{ setId: 1, quantity: 5 }]);
  });

  it('adds a new item entry when it was not already in the cart', () => {
    updateCartQuantity(cookies, { itemId: 9 }, 4);
    expect(getCart(cookies)).toEqual([{ itemId: 9, quantity: 4 }]);
  });

  it('adds a new set entry when it was not already in the cart', () => {
    updateCartQuantity(cookies, { setId: 9 }, 4);
    expect(getCart(cookies)).toEqual([{ setId: 9, quantity: 4 }]);
  });

  it('removes the line when quantity is set to 0', () => {
    addToCart(cookies, { itemId: 1, quantity: 2 });
    updateCartQuantity(cookies, { itemId: 1 }, 0);
    expect(getCart(cookies)).toEqual([]);
  });

  it('removes the line when quantity is negative', () => {
    addToCart(cookies, { itemId: 1, quantity: 2 });
    updateCartQuantity(cookies, { itemId: 1 }, -3);
    expect(getCart(cookies)).toEqual([]);
  });

  it('is a no-op removal when quantity is 0 for an item not in the cart', () => {
    updateCartQuantity(cookies, { itemId: 42 }, 0);
    expect(getCart(cookies)).toEqual([]);
  });

  it('leaves other entries untouched', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    addToCart(cookies, { itemId: 2, quantity: 1 });
    updateCartQuantity(cookies, { itemId: 1 }, 9);
    expect(getCart(cookies)).toEqual([
      { itemId: 1, quantity: 9 },
      { itemId: 2, quantity: 1 },
    ]);
  });
});

describe('removeFromCart', () => {
  let fake: ReturnType<typeof createFakeCookies>;
  let cookies: AstroCookies;

  beforeEach(() => {
    fake = createFakeCookies();
    cookies = asCookies(fake);
  });

  it('removes the matching item entry', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    addToCart(cookies, { itemId: 2, quantity: 1 });
    removeFromCart(cookies, { itemId: 1 });
    expect(getCart(cookies)).toEqual([{ itemId: 2, quantity: 1 }]);
  });

  it('removes the matching set entry without touching an item entry sharing the same id', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    addToCart(cookies, { setId: 1, quantity: 1 });
    removeFromCart(cookies, { setId: 1 });
    expect(getCart(cookies)).toEqual([{ itemId: 1, quantity: 1 }]);
  });

  it('is a no-op when the item is not in the cart', () => {
    addToCart(cookies, { itemId: 1, quantity: 1 });
    removeFromCart(cookies, { itemId: 99 });
    expect(getCart(cookies)).toEqual([{ itemId: 1, quantity: 1 }]);
  });
});

describe('getCartLines', () => {
  let fake: ReturnType<typeof createFakeCookies>;
  let cookies: AstroCookies;

  beforeEach(() => {
    fake = createFakeCookies();
    cookies = asCookies(fake);
  });

  it('returns [] for an empty cart', async () => {
    expect(await getCartLines(cookies)).toEqual([]);
  });

  it('joins a cookie item entry against items/products for display', async () => {
    setCart(cookies, [{ itemId: 1, quantity: 2 }]);
    expect(await getCartLines(cookies)).toEqual([
      {
        itemId: 1,
        productSlug: 'test-rope',
        productTitle: 'Test Rope',
        imageUrl: '/rope-60.jpg',
        quantity: 2,
        stockCount: 5,
        inStock: 5,
        attributes: [{ key: 'Length', value: '60m' }],
      },
    ]);
  });

  it('falls back to the product thumbnail when the item has no image of its own', async () => {
    setCart(cookies, [{ itemId: 2, quantity: 1 }]);
    const [result] = await getCartLines(cookies);
    expect(result).toMatchObject({ imageUrl: '/rope-thumb.jpg' });
  });

  it('drops entries for items that no longer exist', async () => {
    setCart(cookies, [{ itemId: 999, quantity: 1 }]);
    expect(await getCartLines(cookies)).toEqual([]);
  });

  it('drops entries for items that have since been archived', async () => {
    setCart(cookies, [{ itemId: 3, quantity: 1 }]);
    expect(await getCartLines(cookies)).toEqual([]);
  });

  it('drops entries whose product has since been unpublished', async () => {
    setCart(cookies, [{ itemId: 4, quantity: 1 }]);
    expect(await getCartLines(cookies)).toEqual([]);
  });

  it('sorts attributes by sortOrder, not by insertion/query order', async () => {
    setCart(cookies, [{ itemId: 5, quantity: 1 }]);
    const [result] = await getCartLines(cookies);
    expect(result).toMatchObject({
      attributes: [
        { key: 'Length', value: '80m' },
        { key: 'Color', value: 'Red' },
      ],
    });
  });

  it('preserves cart order across multiple item entries', async () => {
    setCart(cookies, [
      { itemId: 2, quantity: 1 },
      { itemId: 1, quantity: 3 },
    ]);
    const result = await getCartLines(cookies);
    expect(result.map((line) => ('itemId' in line ? line.itemId : undefined))).toEqual([2, 1]);
    expect(result.map((line) => line.quantity)).toEqual([1, 3]);
  });

  it('joins a cookie set entry against sets/products for display, with resolved children', async () => {
    // testSet resolves to item 1 (stock 5, qty 1 per set) and item 2 (stock
    // 2, qty 2 per set) — the set's own inStock/stockCount is capped by
    // item 2 (floor(2/2) = 1), not item 1 (floor(5/1) = 5).
    setCart(cookies, [{ setId: 1, quantity: 1 }]);
    expect(await getCartLines(cookies)).toEqual([
      {
        setId: 1,
        productSlug: 'test-rope',
        productTitle: 'Test Rope',
        imageUrl: '/rope-thumb.jpg',
        quantity: 1,
        stockCount: 1,
        inStock: 1,
        attributes: [],
        children: [
          { itemId: 1, name: 'Test Rope 60m (internal)', quantityPerSet: 1 },
          { itemId: 2, name: 'Test Rope 70m (internal)', quantityPerSet: 2 },
        ],
      },
    ]);
  });

  it('drops set entries for sets that have since been archived', async () => {
    setCart(cookies, [{ setId: 2, quantity: 1 }]);
    expect(await getCartLines(cookies)).toEqual([]);
  });

  it('drops set entries whose product has since been unpublished', async () => {
    setCart(cookies, [{ setId: 3, quantity: 1 }]);
    expect(await getCartLines(cookies)).toEqual([]);
  });

  it('preserves cart order when items and sets are mixed', async () => {
    setCart(cookies, [
      { itemId: 2, quantity: 1 },
      { setId: 1, quantity: 2 },
    ]);
    const result = await getCartLines(cookies);
    expect(result).toHaveLength(2);
    expect('itemId' in result[0] && result[0].itemId).toBe(2);
    expect('setId' in result[1] && result[1].setId).toBe(1);
  });
});
