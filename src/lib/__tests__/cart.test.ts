import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AstroCookies } from 'astro';
import { getCart, setCart, addToCart, updateCartQuantity, removeFromCart, getCartItems } from '../cart';

// getCartItems joins the cookie cart against the db (src/lib/cart.ts imports
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

  // item4.id === 4 — tied to a 'hidden' product, for asserting getCartItems
  // drops items whose product has been unpublished (not just archived items).
  const [hiddenProduct] = await db
    .insert(schema.products)
    .values({ slug: 'hidden-rope', title: 'Hidden Rope', categoryId: category.id, status: 'hidden' })
    .returning();
  await db.insert(schema.items).values({ productId: hiddenProduct.id, slug: 'hidden-rope-item', name: 'Hidden Rope Item', stockCount: 4 }).returning();

  await db.insert(schema.itemAttributeValues).values([
    { itemId: 1, attributeId: lengthKey.id, value: '60m' },
    { itemId: 2, attributeId: lengthKey.id, value: '70m' },
  ]);

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

  it('addToCart adds a new entry to an empty cart', () => {
    addToCart(cookies, 42, 3);
    expect(getCart(cookies)).toEqual([{ itemId: 42, quantity: 3 }]);
  });

  it('addToCart defaults quantity to 1 when not given', () => {
    addToCart(cookies, 7);
    expect(getCart(cookies)).toEqual([{ itemId: 7, quantity: 1 }]);
  });

  it('addToCart increments quantity for an existing itemId rather than duplicating it', () => {
    addToCart(cookies, 42, 3);
    addToCart(cookies, 42, 2);
    expect(getCart(cookies)).toEqual([{ itemId: 42, quantity: 5 }]);
  });

  it('addToCart keeps separate entries for different itemIds', () => {
    addToCart(cookies, 1, 1);
    addToCart(cookies, 2, 4);
    addToCart(cookies, 1, 1);
    expect(getCart(cookies)).toEqual([
      { itemId: 1, quantity: 2 },
      { itemId: 2, quantity: 4 },
    ]);
  });

  it('setCart persists an empty cart', () => {
    addToCart(cookies, 1, 1);
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

  it('sets the quantity for an existing entry (not additive, unlike addToCart)', () => {
    addToCart(cookies, 1, 2);
    updateCartQuantity(cookies, 1, 5);
    expect(getCart(cookies)).toEqual([{ itemId: 1, quantity: 5 }]);
  });

  it('adds a new entry when the item was not already in the cart', () => {
    updateCartQuantity(cookies, 9, 4);
    expect(getCart(cookies)).toEqual([{ itemId: 9, quantity: 4 }]);
  });

  it('removes the line when quantity is set to 0', () => {
    addToCart(cookies, 1, 2);
    updateCartQuantity(cookies, 1, 0);
    expect(getCart(cookies)).toEqual([]);
  });

  it('removes the line when quantity is negative', () => {
    addToCart(cookies, 1, 2);
    updateCartQuantity(cookies, 1, -3);
    expect(getCart(cookies)).toEqual([]);
  });

  it('is a no-op removal when quantity is 0 for an item not in the cart', () => {
    updateCartQuantity(cookies, 42, 0);
    expect(getCart(cookies)).toEqual([]);
  });

  it('leaves other entries untouched', () => {
    addToCart(cookies, 1, 1);
    addToCart(cookies, 2, 1);
    updateCartQuantity(cookies, 1, 9);
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

  it('removes the matching entry', () => {
    addToCart(cookies, 1, 1);
    addToCart(cookies, 2, 1);
    removeFromCart(cookies, 1);
    expect(getCart(cookies)).toEqual([{ itemId: 2, quantity: 1 }]);
  });

  it('is a no-op when the item is not in the cart', () => {
    addToCart(cookies, 1, 1);
    removeFromCart(cookies, 99);
    expect(getCart(cookies)).toEqual([{ itemId: 1, quantity: 1 }]);
  });
});

describe('getCartItems', () => {
  let fake: ReturnType<typeof createFakeCookies>;
  let cookies: AstroCookies;

  beforeEach(() => {
    fake = createFakeCookies();
    cookies = asCookies(fake);
  });

  it('returns [] for an empty cart', async () => {
    expect(await getCartItems(cookies)).toEqual([]);
  });

  it('joins a cookie entry against items/products for display', async () => {
    setCart(cookies, [{ itemId: 1, quantity: 2 }]);
    expect(await getCartItems(cookies)).toEqual([
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
    const [result] = await getCartItems(cookies);
    expect(result.imageUrl).toBe('/rope-thumb.jpg');
  });

  it('drops entries for items that no longer exist', async () => {
    setCart(cookies, [{ itemId: 999, quantity: 1 }]);
    expect(await getCartItems(cookies)).toEqual([]);
  });

  it('drops entries for items that have since been archived', async () => {
    setCart(cookies, [{ itemId: 3, quantity: 1 }]);
    expect(await getCartItems(cookies)).toEqual([]);
  });

  it('drops entries whose product has since been unpublished', async () => {
    setCart(cookies, [{ itemId: 4, quantity: 1 }]);
    expect(await getCartItems(cookies)).toEqual([]);
  });

  it('preserves cart order across multiple line items', async () => {
    setCart(cookies, [
      { itemId: 2, quantity: 1 },
      { itemId: 1, quantity: 3 },
    ]);
    const result = await getCartItems(cookies);
    expect(result.map((r) => r.itemId)).toEqual([2, 1]);
    expect(result.map((r) => r.quantity)).toEqual([1, 3]);
  });
});
