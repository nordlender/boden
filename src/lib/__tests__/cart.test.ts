import { describe, it, expect, beforeEach } from 'vitest';
import type { AstroCookies } from 'astro';
import { getCart, setCart, addToCart } from '../cart';

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
