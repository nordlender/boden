import { db } from '../db/client';
import type { users } from '../db/schema';
import { getRole, ROLE_RANK, type Role } from './auth';

// Highest rank first — the order the /admin/users filter chips and the
// list's grouping use.
export const ROLES = ['admin', 'board', 'moderator', 'member'] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
	admin: 'Admin',
	board: 'Board member',
	moderator: 'Moderator',
	member: 'Member',
};

export function isRole(value: unknown): value is Role {
	return (ROLES as readonly unknown[]).includes(value);
}

export interface UserRow {
	id: string;
	name: string | null;
	email: string;
	role: Role;
	createdAt: Date;
}

// Role isn't stored on `users` (see schema.ts) — it's resolved per row via
// `roleOf` (getRole in real use, injectable for tests). Highest role first,
// then by name (falling back to email for users without one).
export function toUserRows(
	rows: (typeof users.$inferSelect)[],
	roleOf: (userId: string) => Role,
	role: Role | null = null,
): UserRow[] {
	return rows
		.map((user) => ({ id: user.id, name: user.name, email: user.email, role: roleOf(user.id), createdAt: user.createdAt }))
		.filter((user) => role === null || user.role === role)
		.sort(
			(a, b) =>
				ROLE_RANK[b.role] - ROLE_RANK[a.role] || (a.name ?? a.email).localeCompare(b.name ?? b.email),
		);
}

// Every user who has signed in at least once, optionally filtered by role —
// the admin's all-users list.
export async function getAllUserRows(role: Role | null = null): Promise<UserRow[]> {
	return toUserRows(await db.query.users.findMany(), getRole, role);
}
