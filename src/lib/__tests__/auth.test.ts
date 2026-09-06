import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRole,
  _roleCacheSizeForTests,
  _roleCacheHasForTests,
  _clearRoleCacheForTests,
} from '../auth';

// getRole's role classification (admin/moderator/member) depends on
// ADMIN_USER_IDS / MODERATOR_USER_IDS env allowlists, which isn't what these
// tests are about - they only exercise the roleCache's bounded-eviction
// behavior, which holds regardless of which role a userId resolves to.
const CACHE_MAX_SIZE = 500;

describe('auth: roleCache eviction', () => {
  beforeEach(() => {
    _clearRoleCacheForTests();
  });

  it('never grows the cache past its cap, even with many more distinct userIds than the cap', async () => {
    const totalIds = CACHE_MAX_SIZE + 50;
    for (let i = 0; i < totalIds; i++) {
      await getRole(`user-${i}`);
    }

    expect(_roleCacheSizeForTests()).toBe(CACHE_MAX_SIZE);
  });

  it('evicts the oldest entries first once the cap is exceeded', async () => {
    const totalIds = CACHE_MAX_SIZE + 50;
    for (let i = 0; i < totalIds; i++) {
      await getRole(`user-${i}`);
    }

    // The first 50 ids inserted should have been evicted to make room...
    for (let i = 0; i < 50; i++) {
      expect(_roleCacheHasForTests(`user-${i}`)).toBe(false);
    }
    // ...while the most recently inserted ids are still cached.
    for (let i = totalIds - 50; i < totalIds; i++) {
      expect(_roleCacheHasForTests(`user-${i}`)).toBe(true);
    }
  });

  it('a fresh (non-stale) hit refreshes recency instead of evicting the key', async () => {
    await getRole('user-warm');
    // Fill the cache with other ids, one short of forcing 'user-warm' out.
    for (let i = 0; i < CACHE_MAX_SIZE - 1; i++) {
      await getRole(`user-filler-${i}`);
    }
    expect(_roleCacheHasForTests('user-warm')).toBe(true);

    // Touch 'user-warm' again (fresh hit, moves it to most-recently-used),
    // then push one more new id in - without the touch, 'user-warm' would be
    // the oldest and get evicted next.
    await getRole('user-warm');
    await getRole('user-new');

    expect(_roleCacheHasForTests('user-warm')).toBe(true);
    expect(_roleCacheSizeForTests()).toBe(CACHE_MAX_SIZE);
  });
});
