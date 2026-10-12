// Units — the physical objects behind an item (see src/db/schema.ts's
// `units` comment). Admin-only: nothing customer- or rental-facing reads a
// unit directly; everything else only sees the stock count derived here.
import { asc, eq, getTableName, inArray, sql, type Column } from 'drizzle-orm';
import { db } from '../db/client';
import { items, units, users, UNIT_STATUSES, type UnitNote, type UnitStatus } from '../db/schema';
import type { BadgeTone } from './badge-styles';
import { isIsoDate, todayIsoInOslo } from './dates';

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

/** Display names for the users who wrote the given units' notes, keyed by user id. */
export async function getNoteAuthorNames(unitRows: Unit[]): Promise<Map<string, string>> {
	const ids = [...new Set(unitRows.flatMap((unit) => unit.notes.map((note) => note.authorId).filter((id): id is string => !!id)))];
	if (ids.length === 0) return new Map();
	const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids));
	return new Map(rows.map((row) => [row.id, row.name ?? row.email]));
}

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

/**
 * Every unit of every item, by id — the flat /admin/units listing. Only the
 * notes' count is read (json_array_length), not the whole lifetime log.
 */
export async function listAllUnits() {
	return db
		.select({
			id: units.id,
			itemId: units.itemId,
			brand: units.brand,
			model: units.model,
			marking: units.marking,
			serialNumber: units.serialNumber,
			manufacturedAt: units.manufacturedAt,
			purchasedAt: units.purchasedAt,
			status: units.status,
			opts: units.opts,
			noteCount: sql<number>`json_array_length(${units.notes})`,
			itemName: items.name,
			itemArchived: items.archived,
		})
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

function noteEntry(text: string, date: string | undefined, authorId: string | null | undefined): UnitNote {
	const day = date?.trim() || todayIsoInOslo();
	assertPastDate(day, 'Note date');
	return { date: day, text, authorId: authorId ?? null };
}

// Appends in SQL (json_insert at '$[#]') rather than read-modify-write in
// JS, so two concurrent writers can't drop each other's note.
function appendNoteSql(entry: UnitNote) {
	return sql`json_insert(${units.notes}, '$[#]', json(${JSON.stringify(entry)}))`;
}

/**
 * Appends one entry to a unit's lifetime log. `date` defaults to today
 * (Oslo) and may be backdated, never future. Returns false if the unit
 * doesn't exist.
 */
export async function addUnitNote(unitId: number, note: { text: string; date?: string; authorId?: string | null }): Promise<boolean> {
	const text = note.text.trim();
	if (!text) throw new Error('note text is required');
	return (
		db
			.update(units)
			.set({ notes: appendNoteSql(noteEntry(text, note.date, note.authorId)) })
			.where(eq(units.id, unitId))
			.run().changes > 0
	);
}

/**
 * Changes a unit's status (e.g. takes it out of service) and logs the
 * change, with the optional reason, in the same statement — so the
 * lifetime log explains every status change. The item's stock follows
 * immediately, since it's derived from active units. Re-submitting the
 * current status with a reason still logs the reason. Returns false if the
 * unit doesn't exist.
 */
export async function setUnitStatus(
	unitId: number,
	status: UnitStatus,
	note: { text?: string; date?: string; authorId?: string | null } = {},
): Promise<boolean> {
	const current = await getUnit(unitId);
	if (!current) return false;
	const reason = note.text?.trim();
	if (current.status === status) {
		if (reason) await addUnitNote(unitId, { text: reason, date: note.date, authorId: note.authorId });
		return true;
	}
	const text = `Status: ${UNIT_STATUS_LABELS[current.status]} → ${UNIT_STATUS_LABELS[status]}${reason ? ` — ${reason}` : ''}`;
	await db
		.update(units)
		.set({ status, notes: appendNoteSql(noteEntry(text, note.date, note.authorId)) })
		.where(eq(units.id, unitId));
	return true;
}
