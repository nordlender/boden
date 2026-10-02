import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/client', async () => {
	const { default: Database } = await import('better-sqlite3');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');
	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const schema = await import('../../db/schema');

	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './src/db/migrations' });

	return { db };
});

const { listMessages, createMessage, deleteMessage, pinMessage, unpinMessage, getMessageById } = await import(
	'../messages'
);

describe('messages', () => {
	beforeEach(async () => {
		for (const message of await listMessages()) {
			await deleteMessage(message.id);
		}
	});

	it('creating then listing round-trips, newest first', async () => {
		await createMessage('First post', 'Admin One', 'user-1');
		await createMessage('Second post', 'Admin Two', 'user-2');
		const rows = await listMessages();
		expect(rows.map((r) => r.content)).toEqual(['Second post', 'First post']);
		expect(rows[0].authorName).toBe('Admin Two');
		expect(rows[0].authorId).toBe('user-2');
	});

	it('trims content, and reports a blank message as not written', async () => {
		expect(await createMessage('  padded  ', 'Admin', 'user-1')).toBe(true);
		expect(await createMessage('   ', 'Admin', 'user-1')).toBe(false);
		const rows = await listMessages();
		expect(rows.map((r) => r.content)).toEqual(['padded']);
	});

	it('deleting removes the message', async () => {
		await createMessage('Gone soon', 'Admin', 'user-1');
		const [message] = await listMessages();
		await deleteMessage(message.id);
		expect(await listMessages()).toEqual([]);
	});

	it('pinned messages sort before unpinned ones regardless of post order', async () => {
		await createMessage('Older, unpinned', 'Admin', 'user-1');
		await createMessage('Newer, will be pinned', 'Admin', 'user-1');
		const [newer] = await listMessages();
		await pinMessage(newer.id);
		const rows = await listMessages();
		expect(rows.map((r) => r.content)).toEqual(['Newer, will be pinned', 'Older, unpinned']);
		expect(rows[0].pinnedAt).not.toBeNull();
	});

	it('unpinning drops a message back into newest-first order', async () => {
		await createMessage('Older', 'Admin', 'user-1');
		await createMessage('Newer', 'Admin', 'user-1');
		const [, older] = await listMessages();
		await pinMessage(older.id);
		await unpinMessage(older.id);
		const rows = await listMessages();
		expect(rows.map((r) => r.content)).toEqual(['Newer', 'Older']);
		expect(rows.every((r) => r.pinnedAt === null)).toBe(true);
	});

	it('getMessageById returns the matching row, or undefined when there is none', async () => {
		await createMessage('Findable', 'Admin', 'user-1');
		const [message] = await listMessages();
		expect((await getMessageById(message.id))?.content).toBe('Findable');
		expect(await getMessageById(message.id + 1)).toBeUndefined();
	});
});
