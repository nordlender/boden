import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { upsertSignedInUser, type UsersDb } from '../upsertUser';

// Exercises upsertSignedInUser against a real (in-memory) better-sqlite3 db
// built from the actual migrations, so this is testing against the real
// `users` schema — id PK + email UNIQUE — rather than a hand-rolled stand-in
// that could drift from src/db/schema.ts.
describe('upsertSignedInUser', () => {
  let sqlite: Database.Database;
  let db: UsersDb;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './src/db/migrations' });
  });

  afterEach(() => {
    sqlite.close();
  });

  it('inserts a new user', async () => {
    await upsertSignedInUser(db, { id: 'u1', email: 'a@example.com', name: 'Alice' });
    const row = db.select().from(schema.users).where(eq(schema.users.id, 'u1')).get();
    expect(row).toMatchObject({ id: 'u1', email: 'a@example.com', name: 'Alice' });
  });

  it('updates name/email in place on a repeat sign-in with the same id', async () => {
    await upsertSignedInUser(db, { id: 'u1', email: 'a@example.com', name: 'Alice' });
    await upsertSignedInUser(db, { id: 'u1', email: 'a-new@example.com', name: 'Alice A.' });

    const rows = db.select().from(schema.users).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'u1', email: 'a-new@example.com', name: 'Alice A.' });
  });

  it('does not throw when a different id collides on an existing email, and moves the email onto the new sign-in', async () => {
    // Simulate a stale row: some existing user id already owns this email
    // (e.g. a colleague's old profile, or a reused email address).
    await upsertSignedInUser(db, { id: 'old-id', email: 'shared@example.com', name: 'Old Name' });

    await expect(
      upsertSignedInUser(db, { id: 'new-id', email: 'shared@example.com', name: 'New Name' }),
    ).resolves.not.toThrow();

    const rows = db.select().from(schema.users).all();
    expect(rows).toHaveLength(2);

    // The new sign-in's own id-keyed row now owns the email.
    const newRow = rows.find((r) => r.id === 'new-id');
    expect(newRow).toMatchObject({ id: 'new-id', email: 'shared@example.com', name: 'New Name' });

    // The stale row keeps its own id (and thus any order history referencing
    // it) but no longer holds the email — renamed out of the way instead.
    const oldRow = rows.find((r) => r.id === 'old-id');
    expect(oldRow?.email).not.toBe('shared@example.com');
    expect(oldRow?.name).toBe('Old Name');
  });

  it('does not throw (and does not touch the stale id) when the stale email-owning row has existing order history', async () => {
    await upsertSignedInUser(db, { id: 'old-id', email: 'shared@example.com', name: 'Old Name' });
    // Give the stale row order history — orders.userId references users.id
    // with no ON UPDATE CASCADE, so a naive fix that reassigns the stale
    // row's id instead of its email would throw a foreign-key violation here.
    db.insert(schema.orders)
      .values({ orderCode: 'ABC123', userId: 'old-id', note: null })
      .run();

    await expect(
      upsertSignedInUser(db, { id: 'new-id', email: 'shared@example.com', name: 'New Name' }),
    ).resolves.not.toThrow();

    const order = db.select().from(schema.orders).where(eq(schema.orders.orderCode, 'ABC123')).get();
    expect(order?.userId).toBe('old-id'); // untouched — history stays intact
    const newRow = db.select().from(schema.users).where(eq(schema.users.id, 'new-id')).get();
    expect(newRow).toMatchObject({ id: 'new-id', email: 'shared@example.com' });
  });

  it('does not throw when the signing-in user already has a row and a different existing user owns the incoming email', async () => {
    await upsertSignedInUser(db, { id: 'A', email: 'a@example.com', name: 'A' });
    await upsertSignedInUser(db, { id: 'B', email: 'taken@example.com', name: 'B' });

    // A signs in again, but bloc now reports A's email as the one B holds.
    await expect(
      upsertSignedInUser(db, { id: 'A', email: 'taken@example.com', name: 'A2' }),
    ).resolves.not.toThrow();

    const rows = db.select().from(schema.users).all();
    expect(rows).toHaveLength(2);
    const rowA = rows.find((r) => r.id === 'A');
    expect(rowA).toMatchObject({ id: 'A', email: 'taken@example.com', name: 'A2' });
    const rowB = rows.find((r) => r.id === 'B');
    expect(rowB?.email).not.toBe('taken@example.com');
  });

  it('treats a missing name as null', async () => {
    await upsertSignedInUser(db, { id: 'u2', email: 'b@example.com' });
    const row = db.select().from(schema.users).where(eq(schema.users.id, 'u2')).get();
    expect(row?.name).toBeNull();
  });
});
