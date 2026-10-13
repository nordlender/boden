import { asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { messages } from '../db/schema';

export interface MessageRow {
	id: number;
	content: string;
	authorName: string;
	authorId: string | null;
	createdAt: Date;
	pinnedAt: Date | null;
	// null: a hub-board message; set: a note on that unit (see the `messages`
	// table comment in src/db/schema.ts).
	unitId: number | null;
}

// The hub board: every message that isn't a unit note. Pinned messages first
// (most recently pinned on top), then the rest newest first — the message
// board is otherwise a plain feed (see src/db/schema.ts's `messages` table
// comment for the open questions this deliberately punts on: expiry, read
// receipts). No pagination: admins are expected to only ever post a modest
// number of these, same assumption as listAvailablePickupDates in
// src/lib/pickupDays.ts. Tiebreak on id: two posts within the same second
// (createdAt/pinnedAt have 1s resolution) would otherwise sort in an
// unspecified order.
export async function listMessages(): Promise<MessageRow[]> {
	return db
		.select()
		.from(messages)
		.where(isNull(messages.unitId))
		.orderBy(sql`${messages.pinnedAt} is null`, desc(messages.pinnedAt), desc(messages.createdAt), desc(messages.id));
}

// Each unit's notes (its lifetime log), newest first, keyed by unit id.
// Units with no notes are absent. Same id tiebreak as listMessages.
export async function listUnitNotes(unitIds: number[]): Promise<Map<number, MessageRow[]>> {
	if (unitIds.length === 0) return new Map();
	const rows = await db
		.select()
		.from(messages)
		.where(inArray(messages.unitId, unitIds))
		.orderBy(asc(messages.unitId), desc(messages.createdAt), desc(messages.id));
	const byUnit = new Map<number, MessageRow[]>();
	for (const row of rows) {
		const unitId = row.unitId!;
		const notes = byUnit.get(unitId);
		if (notes) notes.push(row);
		else byUnit.set(unitId, [row]);
	}
	return byUnit;
}

/**
 * Who may delete a message (shown in the UI; enforced again in
 * src/pages/api/messages/delete.ts): an admin may delete any message, anyone
 * else only their own (see issue #225).
 */
export function canDeleteMessage(message: Pick<MessageRow, 'authorId'>, currentUserId: string | null, isAdmin: boolean): boolean {
	return isAdmin || (currentUserId !== null && message.authorId === currentUserId);
}

/**
 * First name plus the initial of the next name, for compact author labels:
 * "John Appleseed" → "John A.", "Ernest Jebediah Zuckman Hansen" →
 * "Ernest J.". A single name is returned as is.
 */
export function shortAuthorName(name: string): string {
	const [first, second] = name.trim().split(/\s+/);
	if (!first) return '';
	return second ? `${first} ${second[0].toUpperCase()}.` : first;
}

// Used by withMessageIdAction (src/lib/messages-http.ts) to load the target
// message before running an id-based action against it.
export async function getMessageById(id: number): Promise<MessageRow | undefined> {
	return db.query.messages.findFirst({ where: eq(messages.id, id) });
}

// Returns the trimmed content, or null for blank/whitespace-only input — the
// `required` attribute on the textarea doesn't stop a spaces-only submission,
// so callers must check this rather than assume a non-void return means the
// write happened.
function normalizeContent(content: string): string | null {
	const trimmed = content.trim();
	return trimmed || null;
}

/** Posts a hub-board message, or — with `unitId` — a note on that unit. */
export async function createMessage(content: string, authorName: string, authorId: string, unitId: number | null = null): Promise<boolean> {
	const trimmed = normalizeContent(content);
	if (!trimmed) return false;
	await db.insert(messages).values({ content: trimmed, authorName, authorId, unitId });
	return true;
}

export async function deleteMessage(id: number): Promise<void> {
	await db.delete(messages).where(eq(messages.id, id));
}

export async function pinMessage(id: number): Promise<void> {
	await db.update(messages).set({ pinnedAt: new Date() }).where(eq(messages.id, id));
}

export async function unpinMessage(id: number): Promise<void> {
	await db.update(messages).set({ pinnedAt: null }).where(eq(messages.id, id));
}
