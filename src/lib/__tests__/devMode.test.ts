import { describe, it, expect } from 'vitest';
import { ALL_DEV_USERS, DEV_MODE, DEV_USERS, findDevUser, isStaleDevUserId } from '../devMode';
import { getRole } from '../auth';

describe('dev mode', () => {
  it('has one test user per role', () => {
    expect(ALL_DEV_USERS.map((u) => [u.name, u.role])).toEqual([
      ['Jane', 'member'],
      ['Bob', 'board'],
      ['Mandy', 'moderator'],
      ['Amitda', 'admin'],
    ]);
  });

  it('finds dev users by id', () => {
    for (const user of ALL_DEV_USERS) {
      expect(findDevUser(user.id, ALL_DEV_USERS)).toBe(user);
    }
    expect(findDevUser('12345', ALL_DEV_USERS)).toBeUndefined();
    expect(findDevUser(undefined, ALL_DEV_USERS)).toBeUndefined();
  });

  it('flags dev ids as stale only when this build has no such dev user', () => {
    expect(isStaleDevUserId('dev-amitda', [])).toBe(true);
    expect(isStaleDevUserId('dev-amitda', ALL_DEV_USERS)).toBe(false);
    expect(isStaleDevUserId('dev-nobody', ALL_DEV_USERS)).toBe(true);
    expect(isStaleDevUserId('12345', [])).toBe(false);
    expect(isStaleDevUserId('example-member-1', [])).toBe(false);
  });

  // Tests run without DEV_MODE set, i.e. as a normal build.
  it('has no dev users and grants them no role when dev mode is off', () => {
    expect(DEV_MODE).toBe(false);
    expect(DEV_USERS).toEqual([]);
    expect(findDevUser('dev-amitda')).toBeUndefined();
    expect(getRole('dev-amitda')).toBe('member');
  });
});
