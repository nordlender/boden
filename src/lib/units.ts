// Units — the physical objects behind an item (see src/db/schema.ts's
// `units` comment). Admin-only: nothing customer- or rental-facing reads a
// unit directly; everything else only sees the stock count derived here.
import { asc, eq, getTableName, sql, type Column } from 'drizzle-orm';
import { db } from '../db/client';
import { items, messages, units, UNIT_STATUSES, type UnitStatus } from '../db/schema';
import type { BadgeTone } from './badge-styles';
import { isIsoDate, todayIsoInOslo } from './dates';
import { createMessage } from './messages';

// Always "table"."column". Drizzle renders a column inside a select list
// unqualified ("id"), which inside the correlated subquery below would bind
// to units.id instead of the outer item's id.
function qualified(column: Column) {
	return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

/**
 * An item's stock: how many of its units are 'active'. `itemId` is the
 * item-id column of whatever query this is embedded in — `items.id` in a
 * plain select, or the aliased column handed to a relational query's
 * `extras` callback (see itemStockExtras).
 */
export function activeUnitCount(itemId: Column) {
	return sql<number>`(select count(*) from ${units} where ${qualified(units.itemId)} = ${qualified(itemId)} and ${qualified(units.status)} = 'active')`;
}

/**
 * Relational-query `extras` that put the derived `stockCount` back onto an
 * item row: `db.query.items.findMany({ extras: itemStockExtras, ... })`, or
 * nested as `with: { item: { extras: itemStockExtras } }`.
 */
export const itemStockExtras = (table: { id: Column }) => ({
	stockCount: activeUnitCount(table.id).as('stock_count'),
});

export function isUnitStatus(value: unknown): value is UnitStatus {
	return typeof value === 'string' && (UNIT_STATUSES as readonly string[]).includes(value);
}

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
	active: 'Active',
	out_of_service: 'Out of service',
	retired: 'Retired',
};

export const UNIT_STATUS_TONES: Record<UnitStatus, BadgeTone> = {
	active: 'success',
	out_of_service: 'warning',
	retired: 'neutral',
};

/** Active first, then out of service, then retired (UNIT_STATUSES order), by id within each. */
export function compareUnitsByStatus(a: { id: number; status: UnitStatus }, b: { id: number; status: UnitStatus }): number {
	return UNIT_STATUSES.indexOf(a.status) - UNIT_STATUSES.indexOf(b.status) || a.id - b.id;
}

// Free-text fields an admin can set on a unit. Empty strings are stored as
// NULL so "not filled in" has one representation.
export interface UnitFields {
	brand?: string | null;
	model?: string | null;
	marking?: string | null;
	serialNumber?: string | null;
	manufacturedAt?: string | null;
	purchasedAt?: string | null;
	opts?: Record<string, string>;
}

export const UNIT_TEXT_FIELDS = ['brand', 'model', 'marking', 'serialNumber', 'manufacturedAt', 'purchasedAt'] as const;

// A real calendar date (rejects 2026-02-31), and not in the future: every
// date on a unit records something that already happened.
function assertPastDate(value: string, label: string): void {
	if (!isIsoDate(value)) throw new Error(`${label} must be a real date (YYYY-MM-DD)`);
	if (value > todayIsoInOslo()) throw new Error(`${label} can't be in the future`);
}

function normalizeFields(fields: UnitFields): UnitFields {
	const out: UnitFields = {};
	for (const key of UNIT_TEXT_FIELDS) {
		if (key in fields) out[key] = fields[key]?.trim() || null;
	}
	if (out.manufacturedAt) assertPastDate(out.manufacturedAt, 'Manufactured date');
	if (out.purchasedAt) assertPastDate(out.purchasedAt, 'Purchased date');
	if (fields.opts) out.opts = normalizeOpts(fields.opts);
	return out;
}

/** Trims keys/values and drops pairs with an empty key. */
export function normalizeOpts(opts: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(opts)) {
		const k = key.trim();
		if (k) out[k] = String(value ?? '').trim();
	}
	return out;
}

/**
 * Builds opts from the admin form's paired name/value fields (index i of
 * `keys` goes with index i of `values`). A row left completely blank is
 * skipped; a value without a name, or the same name twice, is an error
 * rather than silently dropped.
 */
export function parseOptsFields(keys: string[], values: string[]): Record<string, string> {
	const opts: Record<string, string> = {};
	keys.forEach((rawKey, i) => {
		const key = rawKey.trim();
		const value = (values[i] ?? '').trim();
		if (!key && !value) return;
		if (!key) throw new Error(`Extra field "${value}" needs a name`);
		if (key in opts) throw new Error(`Extra field "${key}" is listed twice`);
		opts[key] = value;
	});
	return opts;
}

export type Unit = typeof units.$inferSelect;

/** The item a units page is about, with its product title (null if the item doesn't exist). */
export async function getUnitsPageItem(itemId: number) {
	return (
		(await db.query.items.findFirst({
			where: (t, { eq: eqCol }) => eqCol(t.id, itemId),
			columns: { id: true, name: true, imageUrl: true, archived: true },
			with: { product: { columns: { title: true } } },
		})) ?? null
	);
}

export async function listUnitsForItem(itemId: number): Promise<Unit[]> {
	return db.select().from(units).where(eq(units.itemId, itemId)).orderBy(asc(units.id)).all();
}

/** The item a unit belongs to, as shown next to it on /admin/units. */
export interface UnitItemRef {
	id: number;
	name: string;
	archived: boolean;
}

/** Every unit of every item, by id — the /admin/units listing — with the item each belongs to. */
export async function listAllUnits(): Promise<{ unit: Unit; item: UnitItemRef }[]> {
	return db
		.select({ unit: units, item: { id: items.id, name: items.name, archived: items.archived } })
		.from(units)
		.innerJoin(items, eq(units.itemId, items.id))
		.orderBy(asc(units.id))
		.all();
}

export async function getUnit(unitId: number): Promise<Unit | undefined> {
	return db.select().from(units).where(eq(units.id, unitId)).get();
}

/**
 * Adds `count` units to an item, all sharing `fields` (e.g. a batch bought
 * together: same brand/model/purchase date). Returns the new ids.
 */
export async function createUnits(itemId: number, count: number, fields: UnitFields = {}): Promise<number[]> {
	if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
	const values = normalizeFields(fields);
	const rows = db
		.insert(units)
		.values(Array.from({ length: count }, () => ({ itemId, ...values })))
		.returning({ id: units.id })
		.all();
	return rows.map((row) => row.id);
}

/** Returns false if the unit doesn't exist. */
export async function updateUnit(unitId: number, fields: UnitFields): Promise<boolean> {
	const values = normalizeFields(fields);
	if (Object.keys(values).length === 0) return !!(await getUnit(unitId));
	return db.update(units).set(values).where(eq(units.id, unitId)).run().changes > 0;
}

/**
 * Changes a unit's status (e.g. takes it out of service) and posts a note
 * on the unit saying so, with the optional reason — in one transaction, so
 * the unit's notes explain every status change. The item's stock follows
 * immediately, since it's derived from active units. Re-submitting the
 * current status with a reason still posts the reason as a note. Returns
 * false if the unit doesn't exist.
 */
export async function setUnitStatus(
	unitId: number,
	status: UnitStatus,
	author: { id: string; name: string },
	reason = '',
): Promise<boolean> {
	const current = await getUnit(unitId);
	if (!current) return false;
	const trimmedReason = reason.trim();
	if (current.status === status) {
		if (trimmedReason) await createMessage(trimmedReason, author.name, author.id, unitId);
		return true;
	}
	const content = `Status: ${UNIT_STATUS_LABELS[current.status]} → ${UNIT_STATUS_LABELS[status]}${trimmedReason ? ` — ${trimmedReason}` : ''}`;
	db.transaction((tx) => {
		tx.update(units).set({ status }).where(eq(units.id, unitId)).run();
		tx.insert(messages).values({ content, authorName: author.name, authorId: author.id, unitId }).run();
	});
	return true;
}
