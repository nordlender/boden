import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client', async () => {
	const { createTestDb } = await import('../../db/testDb');
	return { db: createTestDb() };
});

const { db } = await import('../../db/client');
const { orders, users } = await import('../../db/schema');
const { markNoShowOrders } = await import('../orderCleanup');

const MEMBER = 'member-1';
type Status = (typeof orders.$inferInsert)['status'];

async function order(orderCode: string, status: Status, fromDate: string) {
	await db.insert(orders).values({ orderCode, userId: MEMBER, status, fromDate, toDate: '2026-11-30' });
}

async function statuses() {
	const rows = await db.select({ orderCode: orders.orderCode, status: orders.status }).from(orders);
	return Object.fromEntries(rows.map((row) => [row.orderCode, row.status]));
}

beforeEach(async () => {
	await db.delete(orders);
	await db.insert(users).values({ id: MEMBER, email: 'member@example.com' }).onConflictDoNothing();
});

describe('markNoShowOrders', () => {
	it('moves scheduled orders whose pick-up day is over to no_show, from the next day on', async () => {
		await order('11AAM', 'scheduled', '2026-11-15');
		await order('12AAM', 'scheduled', '2026-11-16');
		await order('13AAM', 'scheduled', '2026-11-17');

		expect(markNoShowOrders('2026-11-17')).toEqual(['11AAM', '12AAM']);
		// The pick-up day itself is still open: the member can come later today.
		expect(await statuses()).toEqual({ '11AAM': 'no_show', '12AAM': 'no_show', '13AAM': 'scheduled' });
	});

	it('leaves every other status alone', async () => {
		await order('21AAM', 'requested', '2026-11-01');
		await order('22AAM', 'active', '2026-11-01');
		await order('23AAM', 'returned', '2026-11-01');
		await order('24AAM', 'rejected', '2026-11-01');

		expect(markNoShowOrders('2026-11-17')).toEqual([]);
		expect(await statuses()).toEqual({ '21AAM': 'requested', '22AAM': 'active', '23AAM': 'returned', '24AAM': 'rejected' });
	});

	it('is idempotent', async () => {
		await order('31AAM', 'scheduled', '2026-11-10');
		expect(markNoShowOrders('2026-11-17')).toEqual(['31AAM']);
		expect(markNoShowOrders('2026-11-17')).toEqual([]);
	});
});
