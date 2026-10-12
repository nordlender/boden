// Units — the physical objects behind an item (see src/db/schema.ts's
// `units` comment). Admin-only: nothing customer- or rental-facing reads a
// unit directly; everything else only sees the stock count derived here.
import { asc, eq, getTableName, inArray, sql, type Column } from 'drizzle-orm';
import { db } from '../db/client';
import { units, users, UNIT_STATUSES, type UnitNote, type UnitStatus } from '../db/schema';

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

const TEXT_FIELDS = ['brand', 'model', 'marking', 'serialNumber', 'manufacturedAt', 'purchasedAt'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeFields(fields: UnitFields): UnitFields {
	const out: UnitFields = {};
	for (const key of TEXT_FIELDS) {
		if (key in fields) out[key] = fields[key]?.trim() || null;
	}
	for (const key of ['manufacturedAt', 'purchasedAt'] as const) {
		const value = out[key];
		if (value && !ISO_DATE.test(value)) throw new Error(`${key} must be YYYY-MM-DD`);
	}
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

/** Parses the admin form's opts textarea: one `key = value` (or `key: value`) per line. */
export function parseOptsText(text: string): Record<string, string> {
	const opts: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const match = line.match(/^([^=:]+)[=:](.*)$/);
		if (match) opts[match[1]] = match[2];
	}
	return normalizeOpts(opts);
}

export function formatOptsText(opts: Record<string, string>): string {
	return Object.entries(opts)
		.map(([key, value]) => `${key} = ${value}`)
		.join('\n');
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

export async function updateUnit(unitId: number, fields: UnitFields): Promise<void> {
	const values = normalizeFields(fields);
	if (Object.keys(values).length === 0) return;
	await db.update(units).set(values).where(eq(units.id, unitId));
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

function noteEntry(text: string, date: string | undefined, authorId: string | null | undefined): UnitNote {
	const day = date?.trim() || todayIso();
	if (!ISO_DATE.test(day)) throw new Error('date must be YYYY-MM-DD');
	return { date: day, text, authorId: authorId ?? null };
}

// Appends in SQL (json_insert at '$[#]') rather than read-modify-write in
// JS, so two concurrent writers can't drop each other's note.
function appendNoteSql(entry: UnitNote) {
	return sql`json_insert(${units.notes}, '$[#]', json(${JSON.stringify(entry)}))`;
}

/** Appends one entry to a unit's lifetime log. `date` defaults to today and may be backdated. */
export async function addUnitNote(unitId: number, note: { text: string; date?: string; authorId?: string | null }): Promise<void> {
	const text = note.text.trim();
	if (!text) throw new Error('note text is required');
	await db
		.update(units)
		.set({ notes: appendNoteSql(noteEntry(text, note.date, note.authorId)) })
		.where(eq(units.id, unitId));
}

/**
 * Changes a unit's status (e.g. takes it out of service) and logs the
 * change, with the optional reason, in the same statement — so the
 * lifetime log explains every status change. The item's stock follows
 * immediately, since it's derived from active units.
 */
export async function setUnitStatus(
	unitId: number,
	status: UnitStatus,
	note: { text?: string; date?: string; authorId?: string | null } = {},
): Promise<void> {
	const current = await getUnit(unitId);
	if (!current) throw new Error(`unit ${unitId} not found`);
	if (current.status === status) return;
	const reason = note.text?.trim();
	const text = `Status: ${UNIT_STATUS_LABELS[current.status]} → ${UNIT_STATUS_LABELS[status]}${reason ? ` — ${reason}` : ''}`;
	await db
		.update(units)
		.set({ status, notes: appendNoteSql(noteEntry(text, note.date, note.authorId)) })
		.where(eq(units.id, unitId));
}
