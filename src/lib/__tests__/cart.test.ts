import { describe, it, expect, vi } from 'vitest';
import type { AstroCookies } from 'astro';
import { getCart, setCart, addToCart, setCartQuantities, clearCart, finishCheckout, getCartLines, loadCart, parseCartCookie } from '../cart';
import { isCartId } from '../cartEntries';

// getCartLines joins the cookie cart against the db (src/lib/cart.ts imports
// ../db/client, which itself opens a fixed `./data/rental.db` file that
// doesn't exist in a bare checkout/CI runner) — swap it here for a seeded
// in-memory sqlite db instead. The factory is self-contained (only dynamic
// imports + local variables) because vi.mock factories run once, lazily, the
// first time the mocked module is imported — before any outer-scope `let`
// declared later in this file would be initialized.
vi.mock('../../db/client', async () => {
  const { createTestDb, insertItems } = await import('../../db/testDb');
  const schema = await import('../../db/schema');

  const db = createTestDb();

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
  await insertItems(db, { productId: product.id, slug: 'test-rope-60m', name: 'Test Rope 60m (internal)', imageUrl: '/rope-60.jpg', stockCount: 5 });
  await insertItems(db, { productId: product.id, slug: 'test-rope-70m', name: 'Test Rope 70m (internal)', stockCount: 2 });
  await insertItems(db, { slug: 'archived-rope', name: 'Archived Rope', stockCount: 3, archived: true });

  // item4.id === 4 — tied to a 'hidden' product, for asserting getCartLines
  // drops items whose product has been unpublished (not just archived items).
  const [hiddenProduct] = await db
    .insert(schema.products)
    .values({ slug: 'hidden-rope', title: 'Hidden Rope', categoryId: category.id, status: 'hidden' })
    .returning();
  await insertItems(db, { productId: hiddenProduct.id, slug: 'hidden-rope-item', name: 'Hidden Rope Item', stockCount: 4 });

  // item5.id === 5 — two attributes whose sortOrder (Length=0, Color=1) is
  // the reverse of insertion order below, for asserting getCartLines sorts
  // attributes by sortOrder rather than returning them in whatever order the
  // db/query happens to yield.
  const [colorKey] = await db
    .insert(schema.productAttributeKeys)
    .values({ productId: product.id, name: 'Color', sortOrder: 1 })
    .returning();
  await insertItems(db, { productId: product.id, slug: 'test-rope-80m', name: 'Test Rope 80m (internal)', stockCount: 6 });

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
    .values({ productId: product.id, slug: 'test-set', name: 'Test Set (internal)', label: 'M' })
    .returning();
  await db.insert(schema.setItems).values([
    { setId: testSet.id, itemId: 1, quantity: 1 },
    { setId: testSet.id, itemId: 2, quantity: 2 },
  ]);
  await db.insert(schema.sets).values({ productId: product.id, slug: 'archived-set', name: 'Archived Set', archived: true });
  await db.insert(schema.sets).values({ productId: hiddenProduct.id, slug: 'hidden-product-set', name: 'Hidden Product Set' });
  // emptySet.id === 4 (no components); archivedComponentSet.id === 5 (its
  // only component is the archived item 3) — both visible but unorderable.
  await db.insert(schema.sets).values({ productId: product.id, slug: 'empty-set', name: 'Empty Set' });
  const [archivedComponentSet] = await db
    .insert(schema.sets)
    .values({ productId: product.id, slug: 'archived-component-set', name: 'Archived Component Set' })
    .returning();
  await db.insert(schema.setItems).values({ setId: archivedComponentSet.id, itemId: 3, quantity: 1 });

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

const ID = '0b6f8c1e-2f5a-4c3d-9e8b-7a6f5e4d3c2b';

function setup() {
  const fake = createFakeCookies();
  return { fake, cookies: asCookies(fake) };
}

describe('parseCartCookie', () => {
  it('parses { id, entries }', () => {
    expect(parseCartCookie(JSON.stringify({ id: ID, entries: [{ itemId: 1, quantity: 2 }, { setId: 3, quantity: 1 }] }))).toEqual({
      id: ID,
      entries: [
        { itemId: 1, quantity: 2 },
        { setId: 3, quantity: 1 },
      ],
    });
  });

  // Each of these is rejected whole (null), never partly salvaged.
  it.each([
    ['malformed JSON', '{not valid json'],
    ['the old bare-array format', '[{"itemId":1,"quantity":1}]'],
    ['JSON null', 'null'],
    ['missing id', '{"entries":[]}'],
    ['missing entries', `{"id":"${ID}"}`],
    ['a non-uuid id', '{"id":"abc","entries":[]}'],
    ['a numeric id', '{"id":1,"entries":[]}'],
    ['an unknown field', `{"id":"${ID}","entries":[],"extra":1}`],
    ['non-array entries', `{"id":"${ID}","entries":{}}`],
    ['a null entry', `{"id":"${ID}","entries":[null]}`],
    ['a string quantity', `{"id":"${ID}","entries":[{"itemId":1,"quantity":"2"}]}`],
    ['a duplicate line', `{"id":"${ID}","entries":[{"itemId":1,"quantity":1},{"itemId":1,"quantity":2}]}`],
    ['one bad line among good ones', `{"id":"${ID}","entries":[{"itemId":1,"quantity":1},{"itemId":2,"quantity":0}]}`],
  ])('rejects %s', (_label, raw) => {
    expect(parseCartCookie(raw)).toBeNull();
  });
});

describe('getCart / setCart', () => {
  it('reads a missing cookie as an empty cart with a fresh, valid id', () => {
    const { cookies } = setup();
    const cart = getCart(cookies);
    expect(cart.entries).toEqual([]);
    expect(isCartId(cart.id)).toBe(true);
  });

  it('reads a malformed cookie as an empty cart', () => {
    const { fake, cookies } = setup();
    fake.set('cart', '[{"itemId":1,"quantity":1}]');
    expect(getCart(cookies).entries).toEqual([]);
  });

  it('round-trips a cart through the cookie', () => {
    const { cookies } = setup();
    const cart = { id: ID, entries: [{ itemId: 1, quantity: 2 }, { setId: 5, quantity: 1 }] };
    setCart(cookies, cart);
    expect(getCart(cookies)).toEqual(cart);
  });
});

describe('addToCart', () => {
  it('adds new item and set entries, keeping them apart when they share an id', () => {
    const { cookies } = setup();
    addToCart(cookies, { itemId: 1, quantity: 1 });
    addToCart(cookies, { setId: 1, quantity: 2 });
    expect(getCart(cookies).entries).toEqual([
      { itemId: 1, quantity: 1 },
      { setId: 1, quantity: 2 },
    ]);
  });

  it('increments an existing line rather than duplicating it', () => {
    const { cookies } = setup();
    addToCart(cookies, { itemId: 42, quantity: 3 });
    addToCart(cookies, { itemId: 42, quantity: 2 });
    expect(getCart(cookies).entries).toEqual([{ itemId: 42, quantity: 5 }]);
  });

  it('keeps the cart id across additions', () => {
    const { cookies } = setup();
    addToCart(cookies, { itemId: 1, quantity: 1 });
    const { id } = getCart(cookies);
    addToCart(cookies, { itemId: 2, quantity: 1 });
    expect(getCart(cookies).id).toBe(id);
  });

  it('replaces a malformed cookie with a valid cart', () => {
    const { fake, cookies } = setup();
    fake.set('cart', '{"id":"x","entries":[{"itemId":1,"quantity":"2"}]}');
    addToCart(cookies, { itemId: 1, quantity: 1 });
    expect(getCart(cookies).entries).toEqual([{ itemId: 1, quantity: 1 }]);
  });
});

describe('setCartQuantities', () => {
  it('sets quantities outright, adds missing lines and removes lines set to 0 or below — all in one write', () => {
    const { cookies } = setup();
    setCart(cookies, { id: ID, entries: [{ itemId: 1, quantity: 2 }, { setId: 1, quantity: 1 }, { itemId: 3, quantity: 1 }] });
    setCartQuantities(cookies, [
      { ref: { itemId: 1 }, quantity: 5 },
      { ref: { setId: 1 }, quantity: 0 },
      { ref: { itemId: 3 }, quantity: -2 },
      { ref: { setId: 9 }, quantity: 4 },
    ]);
    expect(getCart(cookies)).toEqual({ id: ID, entries: [{ itemId: 1, quantity: 5 }, { setId: 9, quantity: 4 }] });
  });

  it('removing a line that is not in the cart is a no-op', () => {
    const { cookies } = setup();
    setCart(cookies, { id: ID, entries: [{ itemId: 1, quantity: 1 }] });
    setCartQuantities(cookies, [{ ref: { itemId: 42 }, quantity: 0 }]);
    expect(getCart(cookies).entries).toEqual([{ itemId: 1, quantity: 1 }]);
  });
});

describe('clearCart', () => {
  it('empties the cart but keeps its id', () => {
    const { cookies } = setup();
    setCart(cookies, { id: ID, entries: [{ itemId: 1, quantity: 1 }] });
    clearCart(cookies);
    expect(getCart(cookies)).toEqual({ id: ID, entries: [] });
  });
});

describe('finishCheckout', () => {
  it('removes the ordered quantities, keeps the rest, and gives the cart a new id', () => {
    const { cookies } = setup();
    setCart(cookies, { id: ID, entries: [{ itemId: 1, quantity: 2 }, { itemId: 2, quantity: 1 }, { setId: 1, quantity: 3 }] });
    finishCheckout(cookies, [
      { itemId: 1, quantity: 2 },
      { setId: 1, quantity: 1 },
    ]);
    const cart = getCart(cookies);
    expect(cart.entries).toEqual([{ itemId: 2, quantity: 1 }, { setId: 1, quantity: 2 }]);
    expect(isCartId(cart.id)).toBe(true);
    expect(cart.id).not.toBe(ID);
  });

  it('does not confuse an item and a set sharing an id', () => {
    const { cookies } = setup();
    setCart(cookies, { id: ID, entries: [{ itemId: 1, quantity: 1 }, { setId: 1, quantity: 1 }] });
    finishCheckout(cookies, [{ setId: 1, quantity: 1 }]);
    expect(getCart(cookies).entries).toEqual([{ itemId: 1, quantity: 1 }]);
  });
});

describe('getCartLines', () => {
  it('returns [] for no entries', async () => {
    expect(await getCartLines([])).toEqual([]);
  });

  it('joins an item entry against items/products for display', async () => {
    expect(await getCartLines([{ itemId: 1, quantity: 2 }])).toEqual([
      {
        itemId: 1,
        productSlug: 'test-rope',
        productTitle: 'Test Rope',
        imageUrl: '/rope-60.jpg',
        quantity: 2,
        attributes: [{ key: 'Length', value: '60m' }],
      },
    ]);
  });

  it('falls back to the product thumbnail when the item has no image of its own', async () => {
    const [result] = await getCartLines([{ itemId: 2, quantity: 1 }]);
    expect(result).toMatchObject({ imageUrl: '/rope-thumb.jpg' });
  });

  it.each([
    ['items that no longer exist', { itemId: 999, quantity: 1 }],
    ['items that have since been archived', { itemId: 3, quantity: 1 }],
    ['items whose product has since been unpublished', { itemId: 4, quantity: 1 }],
    ['sets that have since been archived', { setId: 2, quantity: 1 }],
    ['sets whose product has since been unpublished', { setId: 3, quantity: 1 }],
    ['sets with no components (checkout would drop them)', { setId: 4, quantity: 1 }],
    ['sets with an archived component (checkout would drop them)', { setId: 5, quantity: 1 }],
  ])('drops %s', async (_label, entry) => {
    expect(await getCartLines([entry])).toEqual([]);
  });

  it('sorts attributes by sortOrder, not by insertion/query order', async () => {
    const [result] = await getCartLines([{ itemId: 5, quantity: 1 }]);
    expect(result).toMatchObject({
      attributes: [
        { key: 'Length', value: '80m' },
        { key: 'Color', value: 'Red' },
      ],
    });
  });

  it('joins a set entry against sets/products for display, with resolved children', async () => {
    expect(await getCartLines([{ setId: 1, quantity: 1 }])).toEqual([
      {
        setId: 1,
        productSlug: 'test-rope',
        productTitle: 'Test Rope',
        imageUrl: '/rope-thumb.jpg',
        quantity: 1,
        label: 'M',
        children: [
          { itemId: 1, productTitle: 'Test Rope', quantityPerSet: 1 },
          { itemId: 2, productTitle: 'Test Rope', quantityPerSet: 2 },
        ],
      },
    ]);
  });

  it('preserves cart order when items and sets are mixed', async () => {
    const result = await getCartLines([
      { itemId: 2, quantity: 1 },
      { setId: 1, quantity: 2 },
      { itemId: 1, quantity: 3 },
    ]);
    expect(result.map((line) => ('itemId' in line ? `item:${line.itemId}` : `set:${line.setId}`))).toEqual(['item:2', 'set:1', 'item:1']);
    expect(result.map((line) => line.quantity)).toEqual([1, 2, 3]);
  });
});

describe('loadCart', () => {
  it('returns the shown lines and a snapshot of exactly those lines under the cookie id', async () => {
    const { cookies } = setup();
    setCart(cookies, { id: ID, entries: [{ itemId: 1, quantity: 2 }, { itemId: 3, quantity: 1 }, { setId: 1, quantity: 1 }] });
    const cart = await loadCart(cookies);
    expect(cart.cartId).toBe(ID);
    // Item 3 is archived: hidden, so it's not in the snapshot either.
    expect(cart.entries).toEqual([{ itemId: 1, quantity: 2 }, { setId: 1, quantity: 1 }]);
    expect(cart.lines).toHaveLength(2);
  });

  it('returns an empty snapshot for a malformed cookie instead of throwing', async () => {
    const { fake, cookies } = setup();
    fake.set('cart', '{}');
    const cart = await loadCart(cookies);
    expect(cart.entries).toEqual([]);
    expect(cart.lines).toEqual([]);
  });
});
