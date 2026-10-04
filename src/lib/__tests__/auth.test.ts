import { describe, it, expect } from 'vitest';
import { hasRole, ROLE_RANK } from '../auth';

describe('hasRole', () => {
  it('ranks member < moderator < board < admin', () => {
    expect(ROLE_RANK.member).toBeLessThan(ROLE_RANK.moderator);
    expect(ROLE_RANK.moderator).toBeLessThan(ROLE_RANK.board);
    expect(ROLE_RANK.board).toBeLessThan(ROLE_RANK.admin);
  });

  it('accepts roles at or above the minimum', () => {
    expect(hasRole('moderator', 'moderator')).toBe(true);
    expect(hasRole('board', 'moderator')).toBe(true);
    expect(hasRole('admin', 'moderator')).toBe(true);
    expect(hasRole('admin', 'admin')).toBe(true);
  });

  it('rejects roles below the minimum', () => {
    expect(hasRole('member', 'moderator')).toBe(false);
    expect(hasRole('moderator', 'admin')).toBe(false);
    expect(hasRole('board', 'admin')).toBe(false);
  });

  it('rejects a missing role', () => {
    expect(hasRole(undefined, 'member')).toBe(false);
    expect(hasRole(null, 'member')).toBe(false);
  });
});
