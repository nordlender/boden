import type { AstroCookies } from 'astro';
import { ORDER_CODE_LENGTH } from './orders';

// One-shot "your order was deleted/cancelled" notice for /orders (#371).
// Set by the delete/cancel API routes only after the write succeeded, and
// consumed (read + cleared) by the /orders page — so a crafted link can't
// show a fake notice, and a reload or Back doesn't show it again.

export type OrderNoticeKind = 'deleted' | 'cancelled';
export type OrderNotice = { kind: OrderNoticeKind; orderCode: string };

const COOKIE = 'order_notice';
const COOKIE_PATH = '/orders';
const ORDER_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${ORDER_CODE_LENGTH}}$`);

export function setOrderNotice(cookies: AstroCookies, kind: OrderNoticeKind, orderCode: string): void {
	cookies.set(COOKIE, `${kind}:${orderCode}`, {
		path: COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60, // only has to survive the redirect to /orders
	});
}

export function takeOrderNotice(cookies: AstroCookies): OrderNotice | null {
	const value = cookies.get(COOKIE)?.value;
	if (value === undefined) return null;
	cookies.delete(COOKIE, { path: COOKIE_PATH });

	const [kind, orderCode] = value.split(':');
	if ((kind !== 'deleted' && kind !== 'cancelled') || !orderCode || !ORDER_CODE_PATTERN.test(orderCode)) {
		return null;
	}
	return { kind, orderCode };
}
