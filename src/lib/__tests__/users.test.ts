import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client', () => ({ db: {} }));

const { ROLES, isRole, toUserRows } = await import('../users');
const { ROLE_RANK } = await import('../auth');

const user = (id: string, name: string | null, email = `${id}@example.com`) => ({
	id,
	name,
	email,
	createdAt: new Date('2026-01-01T00:00:00Z'),
});

const roles: Record<string, 'admin' | 'board' | 'moderator' | 'member'> = {
	a: 'admin',
	b: 'board',
	m: 'moderator',
};
const roleOf = (id: string) => roles[id] ?? 'member';

describe('ROLES', () => {
	it('lists every role, highest rank first', () => {
		expect([...ROLES].sort()).toEqual(Object.keys(ROLE_RANK).sort());
		const ranks = ROLES.map((r) => ROLE_RANK[r]);
		expect(ranks).toEqual([...ranks].sort((x, y) => y - x));
	});

	it('isRole validates', () => {
		expect(isRole('board')).toBe(true);
		expect(isRole('nope')).toBe(false);
		expect(isRole(null)).toBe(false);
	});
});

describe('toUserRows', () => {
	const rows = [user('x', 'Zed'), user('m', 'Mia'), user('y', null, 'anna@example.com'), user('a', 'Ola'), user('b', 'Bo')];

	it('resolves roles and sorts highest role first, then by name or email', () => {
		expect(toUserRows(rows, roleOf).map((r) => [r.id, r.role])).toEqual([
			['a', 'admin'],
			['b', 'board'],
			['m', 'moderator'],
			['y', 'member'],
			['x', 'member'],
		]);
	});

	it('filters by role', () => {
		expect(toUserRows(rows, roleOf, 'member').map((r) => r.id)).toEqual(['y', 'x']);
		expect(toUserRows(rows, roleOf, 'board').map((r) => r.id)).toEqual(['b']);
	});
});
