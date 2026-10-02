import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { messages } from '../db/schema';

export interface MessageRow {
	id: number;
	content: string;
	authorName: string;
	authorId: string | null;
	createdAt: Date;
	pinnedAt: Date | null;
}

// Pinned messages first (most recently pinned on top), then the rest newest
// first — the message board is otherwise a plain feed (see src/db/schema.ts's
// `messages` table comment for the open questions this deliberately punts
// on: expiry, read receipts). No pagination: admins are expected to only
// ever post a modest number of these, same assumption as
// listAvailablePickupDates in src/lib/pickupDays.ts. Tiebreak on id: two
// posts within the same second (createdAt/pinnedAt have 1s resolution)
// would otherwise sort in an unspecified order.
export async function listMessages(): Promise<MessageRow[]> {
	return db
		.select()
		.from(messages)
		.orderBy(sql`${messages.pinnedAt} is null`, desc(messages.pinnedAt), desc(messages.createdAt), desc(messages.id));
}

// Used by withMessageIdAction (src/lib/messages-http.ts) to load the target
// message before authorizing an id-based action against it — e.g. the
// "moderators may delete only their own message" rule (see
// src/pages/api/messages/delete.ts) needs the row's authorId, not just its
// id.
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

export async function createMessage(content: string, authorName: string, authorId: string): Promise<boolean> {
	const trimmed = normalizeContent(content);
	if (!trimmed) return false;
	await db.insert(messages).values({ content: trimmed, authorName, authorId });
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
