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

const { listMessages, createMessage, updateMessage, deleteMessage } = await import('../messages');

describe('messages', () => {
	beforeEach(async () => {
		for (const message of await listMessages()) {
			await deleteMessage(message.id);
		}
	});

	it('creating then listing round-trips, newest first', async () => {
		await createMessage('First post', 'Admin One');
		await createMessage('Second post', 'Admin Two');
		const rows = await listMessages();
		expect(rows.map((r) => r.content)).toEqual(['Second post', 'First post']);
		expect(rows[0].authorName).toBe('Admin Two');
	});

	it('trims content, and reports a blank message as not written', async () => {
		expect(await createMessage('  padded  ', 'Admin')).toBe(true);
		expect(await createMessage('   ', 'Admin')).toBe(false);
		const rows = await listMessages();
		expect(rows.map((r) => r.content)).toEqual(['padded']);
	});

	it('updateMessage reports a blank message as not written, leaving the original content', async () => {
		await createMessage('Original', 'Admin');
		const [message] = await listMessages();
		expect(await updateMessage(message.id, '   ')).toBe(false);
		const [unchanged] = await listMessages();
		expect(unchanged.content).toBe('Original');
	});

	it('updating changes the content and updatedAt', async () => {
		await createMessage('Original', 'Admin');
		const [message] = await listMessages();
		await updateMessage(message.id, 'Edited');
		const [updated] = await listMessages();
		expect(updated.content).toBe('Edited');
		expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());
	});

	it('deleting removes the message', async () => {
		await createMessage('Gone soon', 'Admin');
		const [message] = await listMessages();
		await deleteMessage(message.id);
		expect(await listMessages()).toEqual([]);
	});
});
