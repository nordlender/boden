import { describe, it, expect, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { orderItems, orders, units, users } from '../../db/schema';
import { insertItems } from '../../db/testDb';
import { getOverbookedOrders, getStockCounts } from '../availability';
import { createItem } from '../wizard';
import { addUnitNote, createUnits, getUnit, listUnitsForItem, normalizeOpts, parseOptsText, setUnitStatus, updateUnit } from '../units';

// Fixture: item 1 with 3 blank active units (ids 1..3).
vi.mock('../../db/client', async () => {
	const { createTestDb, insertItems } = await import('../../db/testDb');
	const db = createTestDb();
	await insertItems(db, { slug: 'cam', name: 'Dragon Cam #2', stockCount: 3 });
	return { db };
});

describe('stock derived from units', () => {
	it('counts only active units, so out-of-service and retired units leave stock', async () => {
		expect(getStockCounts([1]).get(1)).toBe(3);
		await setUnitStatus(1, 'out_of_service', { text: 'Sling worn', date: '2026-10-01', authorId: 'admin-1' });
		expect(getStockCounts([1]).get(1)).toBe(2);
		await setUnitStatus(2, 'retired');
		expect(getStockCounts([1]).get(1)).toBe(1);
		await setUnitStatus(1, 'active', { text: 'Sling replaced' });
		expect(getStockCounts([1]).get(1)).toBe(2);
	});

	it('logs every status change in the unit notes, oldest first', async () => {
		const unit = await getUnit(1);
		expect(unit?.notes).toEqual([
			{ date: '2026-10-01', text: 'Status: Active → Out of service — Sling worn', authorId: 'admin-1' },
			expect.objectContaining({ text: 'Status: Out of service → Active — Sling replaced', authorId: null }),
		]);
	});

	it('createUnits adds a batch sharing the given fields', async () => {
		const ids = await createUnits(1, 2, { brand: 'DMM', model: 'Dragon 2', purchasedAt: '2026-05-01', serialNumber: '  ' });
		expect(ids).toHaveLength(2);
		const rows = await listUnitsForItem(1);
		expect(rows.filter((row) => ids.includes(row.id))).toEqual([
			expect.objectContaining({ brand: 'DMM', model: 'Dragon 2', purchasedAt: '2026-05-01', serialNumber: null, status: 'active', notes: [], opts: {} }),
			expect.objectContaining({ brand: 'DMM', model: 'Dragon 2', purchasedAt: '2026-05-01', serialNumber: null, status: 'active', notes: [], opts: {} }),
		]);
		expect(getStockCounts([1]).get(1)).toBe(4);
	});

	it('createItem gives a new item one placeholder unit by default', async () => {
		const itemId = await createItem({ name: 'Ice Axe' });
		expect(getStockCounts([itemId]).get(itemId)).toBe(1);
		const withThree = await createItem({ name: 'Rope', unitCount: 3 });
		expect(getStockCounts([withThree]).get(withThree)).toBe(3);
	});
});

describe('getOverbookedOrders', () => {
	it('lists the orders a lowered stock no longer covers, and nothing while stock suffices', async () => {
		const TODAY = '2026-10-12';
		const [item] = await insertItems(db, { slug: 'harness', name: 'Harness', stockCount: 2 });
		const [harnessUnitA] = await listUnitsForItem(item.id);
		await db.insert(users).values({ id: 'member', email: 'm@example.com' });
		const [early] = await db
			.insert(orders)
			.values({ orderCode: '11AAM', userId: 'member', status: 'scheduled', fromDate: '2026-10-20', toDate: '2026-10-22' })
			.returning();
		const [overlapping] = await db
			.insert(orders)
			.values({ orderCode: '22BBM', userId: 'member', status: 'requested', fromDate: '2026-10-21', toDate: '2026-10-25' })
			.returning();
		await db.insert(orders).values({ orderCode: '33CCM', userId: 'member', status: 'requested', fromDate: '2026-11-10', toDate: '2026-11-11' });
		await db.insert(orderItems).values([
			{ orderId: early.id, itemId: item.id, requestedQuantity: 1 },
			{ orderId: overlapping.id, itemId: item.id, requestedQuantity: 1 },
			{ orderId: 3, itemId: item.id, requestedQuantity: 1 },
		]);

		expect(getOverbookedOrders(item.id, 60, { today: TODAY })).toEqual([]);

		await setUnitStatus(harnessUnitA.id, 'out_of_service', { text: 'Inspection' });
		// One unit left: the two overlapping orders collide on 21–22 Oct; the
		// November order alone fits.
		expect(getOverbookedOrders(item.id, 60, { today: TODAY }).map((o) => o.orderCode)).toEqual(['11AAM', '22BBM']);
	});
});

describe('unit fields', () => {
	it('stores opts as a key/value object, e.g. a cut rope length', async () => {
		await updateUnit(3, { marking: 'OSI-07', opts: { ' length ': ' 58 m ', '': 'dropped' } });
		expect(await getUnit(3)).toMatchObject({ marking: 'OSI-07', opts: { length: '58 m' } });
	});

	it('appends notes without overwriting earlier ones', async () => {
		await addUnitNote(3, { text: 'Inspected, OK', date: '2026-09-01' });
		await addUnitNote(3, { text: 'Washed' });
		const notes = (await getUnit(3))?.notes ?? [];
		expect(notes.map((n) => n.text)).toEqual(['Inspected, OK', 'Washed']);
	});

	it('rejects malformed dates and empty notes', async () => {
		await expect(updateUnit(3, { manufacturedAt: '2026/01/01' })).rejects.toThrow();
		await expect(addUnitNote(3, { text: '   ' })).rejects.toThrow();
		await expect(addUnitNote(3, { text: 'x', date: 'yesterday' })).rejects.toThrow();
	});

	it('the db itself rejects an unknown status or non-object opts', () => {
		// Drizzle wraps the sqlite error; the CHECK failure is its cause.
		const sqliteError = (run: () => unknown) => {
			try {
				run();
			} catch (error) {
				return String((error as { cause?: unknown }).cause ?? error);
			}
			return 'did not throw';
		};
		expect(sqliteError(() => db.run(sql`update units set status = 'lost' where id = 3`))).toMatch(/CHECK constraint failed: units_status_valid/);
		expect(sqliteError(() => db.update(units).set({ opts: [] as unknown as Record<string, string> }).where(eq(units.id, 3)).run())).toMatch(
			/CHECK constraint failed: units_opts_is_object/,
		);
	});

	it('normalizeOpts trims and drops empty keys', () => {
		expect(normalizeOpts({ ' a ': ' 1 ', '  ': 'x' })).toEqual({ a: '1' });
	});

	it('parseOptsText reads key = value / key: value lines', () => {
		expect(parseOptsText('length = 58 m\ncolour: red\n\nnonsense line\n = no key')).toEqual({ length: '58 m', colour: 'red' });
	});
});
