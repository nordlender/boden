import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { APIContext, AstroCookies } from 'astro';
import { POST as createOrderRoute } from '../../pages/api/orders/create';
import { POST as updateAllRoute } from '../../pages/api/cart/update-all';
import { getCart, newCartId, setCart } from '../cart';
import { isCartEntryAvailable } from '../cart-http';
import type { CartEntry } from '../cartEntries';

// The cart/checkout routes end to end against an in-memory db: what a
// member's browser posts, what the routes answer, and what ends up in the
// cookie and the orders table.

// Order dates must not be before "today" (isValidDateRange). Only Date is
// faked, so the concurrent-submit test still runs real promises.
beforeAll(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2025-12-01T00:00:00Z'));
});
afterAll(() => {
	vi.useRealTimers();
});

// The order route asks bloc for the member's fee status; not under test here.
vi.mock('../blocFeeStatus', () => ({
	fetchOwnMemberFeeStatus: async () => ({ hasUnpaidFees: null, userIsMember: null }),
}));

// Ids are deterministic (first rows in each table):
//   item 1 — published product, 50 units (plenty for every order below)
//   item 2 — archived, published product
//   item 3 — published product, 1 unit
//   set 1  — items 1 + 3, orderable
//   set 2  — contains archived item 2 (not orderable)
//   set 3  — orderable components, but its product is hidden
vi.mock('../../db/client', async () => {
	const { createTestDb, insertItems } = await import('../../db/testDb');
	const schema = await import('../../db/schema');
	const db = createTestDb();

	const [category] = await db.insert(schema.categories).values({ name: 'Gear', slug: 'gear' }).returning();
	const [product] = await db.insert(schema.products).values({ slug: 'gear', title: 'Gear', categoryId: category.id, status: 'published' }).returning();
	const [hidden] = await db.insert(schema.products).values({ slug: 'hidden', title: 'Hidden', categoryId: category.id, status: 'hidden' }).returning();
	await insertItems(db, { productId: product.id, slug: 'item-1', name: 'Item 1', stockCount: 50 });
	await insertItems(db, { productId: product.id, slug: 'item-2', name: 'Item 2', stockCount: 5, archived: true });
	await insertItems(db, { productId: product.id, slug: 'item-3', name: 'Item 3', stockCount: 1 });
	await db.insert(schema.sets).values({ productId: product.id, slug: 'set-1', name: 'Set 1' });
	await db.insert(schema.sets).values({ productId: product.id, slug: 'set-2', name: 'Set 2' });
	await db.insert(schema.sets).values({ productId: hidden.id, slug: 'set-3', name: 'Set 3' });
	await db.insert(schema.setItems).values([
		{ setId: 1, itemId: 1, quantity: 1 },
		{ setId: 1, itemId: 3, quantity: 1 },
		{ setId: 2, itemId: 2, quantity: 1 },
		{ setId: 3, itemId: 1, quantity: 1 },
	]);
	await db.insert(schema.users).values([
		{ id: 'member-1', name: 'Member', email: 'member@example.com' },
		{ id: 'member-2', name: 'Other', email: 'other@example.com' },
	]);
	return { db };
});

function fakeCookies() {
	const store = new Map<string, string>();
	return {
		get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
		set: (name: string, value: string) => void store.set(name, value),
	} as unknown as AstroCookies;
}

function context(form: Record<string, string>, cookies: AstroCookies, userId: string | null = 'member-1') {
	const body = new FormData();
	for (const [key, value] of Object.entries(form)) body.set(key, value);
	return {
		request: new Request('http://localhost/api', { method: 'POST', body }),
		cookies,
		locals: { user: userId ? { id: userId, role: 'member' } : undefined },
		redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
	} as unknown as APIContext;
}

function checkoutForm(cartId: string, entries: CartEntry[]) {
	return {
		cartId,
		cartEntries: JSON.stringify(entries),
		fromDate: '2026-02-01',
		toDate: '2026-02-02',
		name: 'Member',
		email: 'member@example.com',
		disclaimerAccepted: 'on',
	};
}

// A cookie cart, and the form a confirm page showing it would post.
function cartWith(entries: CartEntry[]) {
	const cookies = fakeCookies();
	const cartId = newCartId();
	setCart(cookies, { id: cartId, entries });
	return { cookies, cartId, form: checkoutForm(cartId, entries) };
}

async function ordersForCart(cartId: string) {
	const { db } = await import('../../db/client');
	return db.query.orders.findMany({ where: (t, { eq }) => eq(t.cartId, cartId), with: { orderItems: true } });
}

const location = (res: Response) => res.headers.get('Location');

describe('POST /api/orders/create', () => {
	it('orders the confirmed cart, then empties it under a new cart id', async () => {
		const { cookies, cartId, form } = cartWith([{ itemId: 1, quantity: 2 }]);
		const res = await createOrderRoute(context(form, cookies));

		expect(res.status).toBe(303);
		expect(location(res)).toMatch(/^\/checkout\/success\?order=\w+$/);
		const [order] = await ordersForCart(cartId);
		expect(order.orderItems).toMatchObject([{ itemId: 1, requestedQuantity: 2 }]);
		const after = getCart(cookies);
		expect(after.entries).toEqual([]);
		expect(after.id).not.toBe(cartId);
	});

	it('sends a resubmitted checkout to the order it already created, without a second order', async () => {
		const { cookies, cartId, form } = cartWith([{ itemId: 1, quantity: 1 }]);
		const first = await createOrderRoute(context(form, cookies));
		const second = await createOrderRoute(context(form, cookies));

		expect(second.status).toBe(303);
		expect(location(second)).toBe(location(first));
		expect(await ordersForCart(cartId)).toHaveLength(1);
	});

	it('creates one order when the same checkout is submitted twice at once', async () => {
		const { cookies, cartId, form } = cartWith([{ itemId: 1, quantity: 1 }]);
		const [a, b] = await Promise.all([createOrderRoute(context(form, cookies)), createOrderRoute(context(form, cookies))]);

		expect(location(a)).toMatch(/^\/checkout\/success/);
		expect(location(b)).toBe(location(a));
		expect(await ordersForCart(cartId)).toHaveLength(1);
	});

	it('rejects a confirmed cart that no longer matches the cookie (changed in another tab)', async () => {
		const { cookies, cartId } = cartWith([{ itemId: 1, quantity: 3 }]);
		const res = await createOrderRoute(context(checkoutForm(cartId, [{ itemId: 1, quantity: 1 }]), cookies));

		expect(location(res)).toBe('/reservation?error=cart_changed');
		expect(await ordersForCart(cartId)).toHaveLength(0);
		expect(getCart(cookies).entries).toEqual([{ itemId: 1, quantity: 3 }]);
	});

	it('rejects the right lines under a different cart id', async () => {
		const { cookies } = cartWith([{ itemId: 1, quantity: 1 }]);
		const otherId = newCartId();
		const res = await createOrderRoute(context(checkoutForm(otherId, [{ itemId: 1, quantity: 1 }]), cookies));
		expect(location(res)).toBe('/reservation?error=cart_changed');
	});

	it('rejects a line the confirm page could not have shown (archived item)', async () => {
		const { cookies, cartId } = cartWith([{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }]);
		const res = await createOrderRoute(context(checkoutForm(cartId, [{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }]), cookies));
		expect(location(res)).toBe('/reservation?error=cart_changed');
	});

	// Each case breaks exactly one field of an otherwise valid checkout.
	it.each([
		['a missing cart id', (form: Record<string, string>) => void delete form.cartId],
		['a malformed cart id', (form: Record<string, string>) => void (form.cartId = 'not-a-uuid')],
		['malformed cart entries', (form: Record<string, string>) => void (form.cartEntries = '[{"itemId":1,"quantity":"1"}]')],
	])('fails with order_failed for %s', async (_label, breakForm) => {
		const { cookies, form } = cartWith([{ itemId: 1, quantity: 1 }]);
		const broken: Record<string, string> = { ...form };
		breakForm(broken);
		const res = await createOrderRoute(context(broken, cookies));
		expect(location(res)).toBe('/reservation?error=order_failed');
	});

	it("doesn't send another member to an order placed from a cart id they posted", async () => {
		const { cookies, form } = cartWith([{ itemId: 1, quantity: 1 }]);
		const placed = await createOrderRoute(context(form, cookies));
		expect(placed.status).toBe(303);

		const res = await createOrderRoute(context(form, fakeCookies(), 'member-2'));
		expect(location(res)).not.toBe(location(placed));
		expect(location(res)).toBe('/reservation?error=cart_changed');
	});

	it('keeps the cart (and its id) when the order fails, so the member can retry', async () => {
		// Item 3 has a single unit — booked first, so the second cart can't get it.
		const first = cartWith([{ itemId: 3, quantity: 1 }]);
		expect((await createOrderRoute(context(first.form, first.cookies))).status).toBe(303);

		const second = cartWith([{ itemId: 3, quantity: 1 }]);
		const res = await createOrderRoute(context(second.form, second.cookies));
		expect(location(res)).toBe('/reservation?error=unavailable');
		expect(getCart(second.cookies)).toEqual({ id: second.cartId, entries: [{ itemId: 3, quantity: 1 }] });
	});

	it('requires a signed-in member', async () => {
		const { cookies, form } = cartWith([{ itemId: 1, quantity: 1 }]);
		expect((await createOrderRoute(context(form, cookies, null))).status).toBe(401);
	});
});

describe('POST /api/cart/update-all', () => {
	it('applies every changed quantity in one go, 0 removing a line, and keeps the cart id', async () => {
		const { cookies, cartId } = cartWith([{ itemId: 1, quantity: 1 }, { setId: 1, quantity: 2 }]);
		const res = await updateAllRoute(context({ quantity_1: '4', quantity_set_1: '0' }, cookies));
		expect(res.status).toBe(204);
		expect(getCart(cookies)).toEqual({ id: cartId, entries: [{ itemId: 1, quantity: 4 }] });
	});

	it("doesn't let an unchanged line for a since-archived item block the rest", async () => {
		const { cookies } = cartWith([{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }]);
		const res = await updateAllRoute(context({ quantity_1: '2', quantity_2: '1' }, cookies));
		expect(res.status).toBe(204);
		expect(getCart(cookies).entries).toEqual([{ itemId: 1, quantity: 2 }, { itemId: 2, quantity: 1 }]);
	});

	it.each([
		['raising an archived item', { quantity_1: '3', quantity_2: '2' }, 404],
		['a set that can no longer be ordered', { quantity_1: '3', quantity_set_2: '1' }, 404],
		['a non-numeric quantity', { quantity_1: 'abc' }, 400],
	])('rejects %s and changes nothing', async (_label, form, status) => {
		const entries = [{ itemId: 1, quantity: 1 }, { itemId: 2, quantity: 1 }];
		const { cookies } = cartWith(entries);
		const res = await updateAllRoute(context(form, cookies));
		expect(res.status).toBe(status);
		expect(getCart(cookies).entries).toEqual(entries);
	});
});

describe('isCartEntryAvailable', () => {
	it.each([
		['a live item', 'item', 1, true],
		['an archived item', 'item', 2, false],
		['an orderable set', 'set', 1, true],
		['a set with an archived component', 'set', 2, false],
		["a set whose product isn't published", 'set', 3, false],
		['a missing set', 'set', 99, false],
	] as const)('%s → %s', async (_label, kind, id, expected) => {
		expect(await isCartEntryAvailable(kind, id)).toBe(expected);
	});
});
