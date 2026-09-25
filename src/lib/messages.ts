import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { messages } from '../db/schema';

export interface MessageRow {
	id: number;
	content: string;
	authorName: string;
	createdAt: Date;
	updatedAt: Date;
}

// Newest first — the message board is a plain feed (see src/db/schema.ts's
// `messages` table comment for the open questions this deliberately
// punts on: expiry, read receipts). No pagination: admins are expected to
// only ever post a modest number of these, same assumption as
// listAvailablePickupDates in src/lib/pickupDays.ts. Tiebreak on id: two
// posts within the same second (createdAt has 1s resolution) would
// otherwise sort in an unspecified order.
export async function listMessages(): Promise<MessageRow[]> {
	return db.select().from(messages).orderBy(desc(messages.createdAt), desc(messages.id));
}

// Returns the trimmed content, or null for blank/whitespace-only input — the
// `required` attribute on the textarea doesn't stop a spaces-only submission,
// so callers must check this rather than assume a non-void return means the
// write happened.
function normalizeContent(content: string): string | null {
	const trimmed = content.trim();
	return trimmed || null;
}

export async function createMessage(content: string, authorName: string): Promise<boolean> {
	const trimmed = normalizeContent(content);
	if (!trimmed) return false;
	await db.insert(messages).values({ content: trimmed, authorName });
	return true;
}

export async function updateMessage(id: number, content: string): Promise<boolean> {
	const trimmed = normalizeContent(content);
	if (!trimmed) return false;
	await db
		.update(messages)
		.set({ content: trimmed, updatedAt: new Date() })
		.where(eq(messages.id, id));
	return true;
}

export async function deleteMessage(id: number): Promise<void> {
	await db.delete(messages).where(eq(messages.id, id));
}
