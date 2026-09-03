import type { AstroCookies } from 'astro';
import { inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { items } from '../db/schema';

export type CartEntry = { itemId: number; quantity: number };
export type CartItem = {
  itemId: number;
  slug: string;
  name: string;
  imageUrl: string;
  quantity: number;
  stockCount: number;
};

export function getCart(cookies: AstroCookies): CartEntry[] {
  try {
    return JSON.parse(cookies.get('cart')?.value ?? '[]');
  } catch {
    return [];
  }
}

export function setCart(cookies: AstroCookies, cart: CartEntry[]) {
  cookies.set('cart', JSON.stringify(cart), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
}

export function addToCart(cookies: AstroCookies, itemId: number, quantity = 1) {
  const cart = getCart(cookies);
  const existing = cart.find((e) => e.itemId === itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ itemId, quantity });
  }
  setCart(cookies, cart);
}

// Sets a line to an exact quantity (as opposed to addToCart's increment) —
// used by the cart page's quantity stepper. A quantity <= 0 drops the line,
// same as removeFromCart.
export function updateCartQuantity(cookies: AstroCookies, itemId: number, quantity: number) {
  const cart = getCart(cookies);
  if (quantity <= 0) {
    setCart(cookies, cart.filter((e) => e.itemId !== itemId));
    return;
  }
  const existing = cart.find((e) => e.itemId === itemId);
  if (existing) {
    existing.quantity = quantity;
  } else {
    cart.push({ itemId, quantity });
  }
  setCart(cookies, cart);
}

export function removeFromCart(cookies: AstroCookies, itemId: number) {
  const cart = getCart(cookies);
  setCart(cookies, cart.filter((e) => e.itemId !== itemId));
}

// Joins the cookie cart against the items table for display (name/image) —
// used by the cart sidebar and the /api/cart endpoint it fetches from.
export async function getCartItems(cookies: AstroCookies): Promise<CartItem[]> {
  const cart = getCart(cookies);
  if (cart.length === 0) return [];

  const rows = await db.query.items.findMany({
    where: inArray(
      items.id,
      cart.map((e) => e.itemId)
    ),
  });

  return cart
    .map((entry) => {
      const item = rows.find((row) => row.id === entry.itemId);
      if (!item) return null;
      return {
        itemId: item.id,
        slug: item.slug,
        name: item.name,
        imageUrl: item.imageUrl,
        quantity: entry.quantity,
        stockCount: item.stockCount,
      };
    })
    .filter((item): item is CartItem => item !== null);
}
