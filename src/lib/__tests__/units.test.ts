import { describe, it, expect, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { orderItems, orders, units, users } from '../../db/schema';
import { insertItems } from '../../db/testDb';
import { getOverbookedOrders, getStockCounts } from '../availability';
import { createMessage, listMessages, listUnitNotes } from '../messages';
import { createItem } from '../wizard';
import { createUnits, getUnit, listAllUnits, listUnitsForItem, normalizeOpts, parseOptsFields, setUnitStatus, updateUnit } from '../units';

const ADMIN = { id: 'admin-1', name: 'Ada Admin' };
const notesOf = async (unitId: number) => (await listUnitNotes([unitId])).get(unitId) ?? [];

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
		await setUnitStatus(1, 'out_of_service', ADMIN, 'Sling worn');
		expect(getStockCounts([1]).get(1)).toBe(2);
		await setUnitStatus(2, 'retired', ADMIN);
		expect(getStockCounts([1]).get(1)).toBe(1);
		await setUnitStatus(1, 'active', ADMIN, 'Sling replaced');
		expect(getStockCounts([1]).get(1)).toBe(2);
	});

	it('posts every status change as a note on the unit, newest first', async () => {
		expect((await notesOf(1)).map((note) => note.content)).toEqual([
			'Status: Out of service → Active — Sling replaced',
			'Status: Active → Out of service — Sling worn',
		]);
		expect((await notesOf(1))[0]).toMatchObject({ authorId: 'admin-1', authorName: 'Ada Admin', unitId: 1, pinnedAt: null });
		expect((await notesOf(2)).map((note) => note.content)).toEqual(['Status: Active → Retired']);
	});

	it('createUnits adds a batch sharing the given fields', async () => {
		const ids = await createUnits(1, 2, { brand: 'DMM', model: 'Dragon 2', purchasedAt: '2026-05-01', serialNumber: '  ' });
		expect(ids).toHaveLength(2);
		const rows = await listUnitsForItem(1);
		expect(rows.filter((row) => ids.includes(row.id))).toEqual([
			expect.objectContaining({ brand: 'DMM', model: 'Dragon 2', purchasedAt: '2026-05-01', serialNumber: null, status: 'active', opts: {} }),
			expect.objectContaining({ brand: 'DMM', model: 'Dragon 2', purchasedAt: '2026-05-01', serialNumber: null, status: 'active', opts: {} }),
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

		await setUnitStatus(harnessUnitA.id, 'out_of_service', ADMIN, 'Inspection');
		// One unit left: the two overlapping orders collide on 21–22 Oct; the
		// November order alone fits.
		expect(getOverbookedOrders(item.id, 60, { today: TODAY }).map((o) => o.orderCode)).toEqual(['11AAM', '22BBM']);
	});
});

describe('unit notes are messages', () => {
	it('keeps unit notes off the hub board, and hub posts out of unit notes', async () => {
		await createMessage('Hub: closed Friday', 'Mod', 'mod-1');
		await createMessage('Inspected, OK', ADMIN.name, ADMIN.id, 3);
		expect((await listMessages()).map((m) => m.content)).toEqual(['Hub: closed Friday']);
		expect((await notesOf(3)).map((m) => m.content)).toEqual(['Inspected, OK']);
	});

	it('posts the reason as a note even when the status is unchanged, and nothing without one', async () => {
		await setUnitStatus(3, 'active', ADMIN, 'Re-inspected, still fine');
		expect((await notesOf(3))[0].content).toBe('Re-inspected, still fine');
		const before = (await notesOf(3)).length;
		await setUnitStatus(3, 'active', ADMIN);
		expect(await notesOf(3)).toHaveLength(before);
	});

	it('a note must point at a real unit', async () => {
		await expect(createMessage('Orphan', ADMIN.name, ADMIN.id, 9999)).rejects.toThrow();
	});
});

describe('unit fields', () => {
	it('stores opts as a key/value object, e.g. a cut rope length', async () => {
		await updateUnit(3, { marking: 'Red and white tape', opts: { ' length ': ' 58 m ', '': 'dropped' } });
		expect(await getUnit(3)).toMatchObject({ marking: 'Red and white tape', opts: { length: '58 m' } });
	});

	it('rejects malformed, impossible and future dates', async () => {
		await expect(updateUnit(3, { manufacturedAt: '2026/01/01' })).rejects.toThrow(/real date/);
		await expect(updateUnit(3, { purchasedAt: '2026-02-31' })).rejects.toThrow(/real date/);
		await expect(updateUnit(3, { purchasedAt: '2999-01-01' })).rejects.toThrow(/future/);
	});

	it('reports a missing unit instead of silently doing nothing', async () => {
		expect(await updateUnit(9999, { brand: 'X' })).toBe(false);
		expect(await setUnitStatus(9999, 'retired', ADMIN)).toBe(false);
		expect(await updateUnit(3, { brand: 'DMM' })).toBe(true);
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

	it('listAllUnits lists every unit across items, by id, with its item', async () => {
		const rows = await listAllUnits();
		const ids = rows.map((row) => row.unit.id);
		expect(ids).toEqual([...ids].sort((a, b) => a - b));
		expect(ids).toHaveLength((await db.select().from(units).all()).length);
		expect(new Set(rows.map((row) => row.item.name))).toEqual(new Set(['Dragon Cam #2', 'Ice Axe', 'Rope', 'Harness']));
		// Full unit rows (what UnitRow renders), each paired with its own item.
		const unit3 = rows.find((row) => row.unit.id === 3);
		expect(unit3?.unit).toEqual(await getUnit(3));
		expect(unit3?.item).toEqual({ id: 1, name: 'Dragon Cam #2', archived: false });
		expect(rows.every((row) => row.item.id === row.unit.itemId)).toBe(true);
	});

	it('normalizeOpts trims and drops empty keys', () => {
		expect(normalizeOpts({ ' a ': ' 1 ', '  ': 'x' })).toEqual({ a: '1' });
	});

	it('parseOptsFields pairs names with values and skips fully blank rows', () => {
		expect(parseOptsFields([' Length ', '', 'Colour'], [' 58 m ', '', 'red'])).toEqual({ Length: '58 m', Colour: 'red' });
		expect(parseOptsFields([], [])).toEqual({});
	});

	it('parseOptsFields rejects a value without a name, or the same name twice', () => {
		expect(() => parseOptsFields(['', 'x'], ['58 m', '1'])).toThrow(/needs a name/);
		expect(() => parseOptsFields(['Length', ' Length'], ['58 m', '60 m'])).toThrow(/twice/);
	});
});
