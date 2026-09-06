import type { AstroCookies } from 'astro';

export type CartEntry = { itemId: number; quantity: number };

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
