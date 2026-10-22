import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	return { db: createTestDb() };
});

const { db } = await import('../../db/client');
const { orders, orderTimeRanges, pickupDays, users } = await import('../../db/schema');
const { getOrderTimeRanges, setOrderTimeRanges } = await import('../orderTimeRanges');

const MEMBER = 'member-1';
let orderId: number;

beforeEach(async () => {
	await db.delete(orders);
	await db.delete(pickupDays);
	await db.insert(users).values({ id: MEMBER, email: 'member@example.com' }).onConflictDoNothing();
	const [order] = await db
		.insert(orders)
		.values({ orderCode: '11AAM', userId: MEMBER, fromDate: '2026-11-10', toDate: '2026-11-12' })
		.returning();
	orderId = order.id;
});

describe('setOrderTimeRanges / getOrderTimeRanges', () => {
	it('stores merged ranges per kind and reads them back sorted', () => {
		const pickup = setOrderTimeRanges(orderId, 'pickup', [{ from: '18:00', to: '20:00' }, { from: '12:00', to: '14:00' }, { from: '14:00', to: '15:00' }]);
		expect(pickup).toEqual({ ok: true, ranges: [{ from: '12:00', to: '15:00' }, { from: '18:00', to: '20:00' }] });
		setOrderTimeRanges(orderId, 'return', [{ from: '09:00', to: '10:00' }]);

		expect(getOrderTimeRanges(orderId)).toEqual({
			pickup: [{ from: '12:00', to: '15:00' }, { from: '18:00', to: '20:00' }],
			return: [{ from: '09:00', to: '10:00' }],
		});
	});

	it('replaces only the given kind on a second write', () => {
		setOrderTimeRanges(orderId, 'pickup', [{ from: '12:00', to: '14:00' }]);
		setOrderTimeRanges(orderId, 'return', [{ from: '09:00', to: '10:00' }]);
		setOrderTimeRanges(orderId, 'pickup', [{ from: '16:00', to: '17:00' }]);

		expect(getOrderTimeRanges(orderId)).toEqual({
			pickup: [{ from: '16:00', to: '17:00' }],
			return: [{ from: '09:00', to: '10:00' }],
		});
	});

	it('writes nothing and returns the error for invalid input', () => {
		setOrderTimeRanges(orderId, 'pickup', [{ from: '12:00', to: '14:00' }]);
		expect(setOrderTimeRanges(orderId, 'pickup', [{ from: '14:00', to: '12:00' }])).toEqual({ ok: false, error: 'from_not_before_to', index: 0 });
		expect(setOrderTimeRanges(orderId, 'pickup', [])).toEqual({ ok: false, error: 'no_ranges' });
		expect(getOrderTimeRanges(orderId).pickup).toEqual([{ from: '12:00', to: '14:00' }]);
	});

	it('returns empty lists for an order without ranges', () => {
		expect(getOrderTimeRanges(orderId)).toEqual({ pickup: [], return: [] });
	});

	it('works inside a transaction, and rolls back with it', () => {
		expect(() =>
			db.transaction((tx) => {
				setOrderTimeRanges(orderId, 'pickup', [{ from: '12:00', to: '14:00' }], tx);
				expect(getOrderTimeRanges(orderId, tx).pickup).toHaveLength(1);
				throw new Error('abort');
			}),
		).toThrow('abort');
		expect(getOrderTimeRanges(orderId).pickup).toEqual([]);
	});

	it('is loadable through the orders relation', async () => {
		setOrderTimeRanges(orderId, 'return', [{ from: '09:00', to: '10:00' }]);
		const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { timeRanges: true } });
		expect(order?.timeRanges).toMatchObject([{ kind: 'return', from: '09:00', to: '10:00' }]);
	});
});

describe('order_time_ranges constraints', () => {
	it('rejects from >= to, a malformed time and an unknown kind at the db level', () => {
		const insert = (values: { kind: string; from: string; to: string }) =>
			db.insert(orderTimeRanges).values({ orderId, ...values } as typeof orderTimeRanges.$inferInsert).run();
		expect(() => insert({ kind: 'pickup', from: '14:00', to: '14:00' })).toThrow(/CHECK/);
		expect(() => insert({ kind: 'pickup', from: '9:00', to: '14:00' })).toThrow(/CHECK/);
		expect(() => insert({ kind: 'delivery', from: '12:00', to: '14:00' })).toThrow(/CHECK/);
	});

	it('cascades when the order is deleted', async () => {
		setOrderTimeRanges(orderId, 'pickup', [{ from: '12:00', to: '14:00' }]);
		await db.delete(orders).where(eq(orders.id, orderId));
		expect(await db.select().from(orderTimeRanges)).toEqual([]);
	});
});

describe('orders.pickupDayId / returnDayId', () => {
	it('reference pickup_days, load through their relations, and block deleting an assigned window', async () => {
		const [pickupWindow, returnWindow] = await db
			.insert(pickupDays)
			.values([
				{ date: '2026-11-10', startTime: '18:00', endTime: '20:00', userId: MEMBER },
				{ date: '2026-11-12', startTime: '12:00', endTime: '13:00', userId: MEMBER },
			])
			.returning();
		await db.update(orders).set({ pickupDayId: pickupWindow.id, returnDayId: returnWindow.id }).where(eq(orders.id, orderId));

		const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { pickupDay: true, returnDay: true } });
		expect(order?.pickupDay?.startTime).toBe('18:00');
		expect(order?.returnDay?.startTime).toBe('12:00');

		const window = await db.query.pickupDays.findFirst({ where: eq(pickupDays.id, pickupWindow.id), with: { pickupOrders: true, returnOrders: true } });
		expect(window?.pickupOrders.map((o) => o.id)).toEqual([orderId]);
		expect(window?.returnOrders).toEqual([]);

		expect(() => db.delete(pickupDays).where(eq(pickupDays.id, pickupWindow.id)).run()).toThrow(/FOREIGN KEY/);
	});

	it('are null on a new order', async () => {
		const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
		expect(order).toMatchObject({ pickupDayId: null, returnDayId: null });
	});
});
