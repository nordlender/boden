import { getToken } from '@auth/core/jwt';

export type Role = 'admin' | 'moderator' | 'member';

// TEMPORARY: bloc doesn't expose a role endpoint yet (see
// bloc_api_handoff.md), so admin/moderator status is a hardcoded allowlist of
// bloc user ids (ADMIN_USER_IDS / MODERATOR_USER_IDS in .env, comma-separated)
// rather than a live external lookup. getRole()'s signature (userId in, Role
// out, cached) is deliberately the same shape a real
// getRoleFromExternalApi(accessToken, cacheKey) would have, so swapping the
// body for a real fetch once bloc ships a role endpoint shouldn't require
// touching validateSession() or the middleware.
const CACHE_TTL_MS = 30_000;

// Bounds roleCache's memory: a long-lived server process sees many distinct
// bloc user ids over time, and without a cap the map would grow forever since
// a stale hit refreshes a key's value in place rather than deleting it. Map
// preserves insertion order, so a basic LRU falls out of "re-insert on hit
// (moves a key to the end), evict the first key on insert once over the cap" -
// no separate LRU data structure needed for a cache this small.
const CACHE_MAX_SIZE = 500;
const roleCache = new Map<string, { role: Role; fetchedAt: number }>();

function parseIdAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

const ADMIN_USER_IDS = parseIdAllowlist(import.meta.env.ADMIN_USER_IDS);
const MODERATOR_USER_IDS = parseIdAllowlist(import.meta.env.MODERATOR_USER_IDS);

export async function getRole(userId: string): Promise<Role> {
  const cached = roleCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    // Re-insert to mark this key as most recently used, so it's not the next
    // one evicted.
    roleCache.delete(userId);
    roleCache.set(userId, cached);
    return cached.role;
  }

  const role: Role = ADMIN_USER_IDS.has(userId)
    ? 'admin'
    : MODERATOR_USER_IDS.has(userId)
      ? 'moderator'
      : 'member';

  roleCache.delete(userId);
  if (roleCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = roleCache.keys().next().value;
    if (oldestKey !== undefined) roleCache.delete(oldestKey);
  }
  roleCache.set(userId, { role, fetchedAt: Date.now() });
  return role;
}

// Test-only: lets the eviction test observe the cache without exposing
// internals to real callers.
export function _roleCacheSizeForTests(): number {
  return roleCache.size;
}

export function _roleCacheHasForTests(userId: string): boolean {
  return roleCache.has(userId);
}

export function _clearRoleCacheForTests(): void {
  roleCache.clear();
}

// Auth.js doesn't expose a bare session-id cookie (only the signed JWT), so
// this decodes the JWT directly. Uses @auth/core/jwt's getToken() rather than
// auth-astro's getSession(): getSession() returns the same shape served to
// client JS via /api/auth/session, which must never carry the raw bloc access
// token — getToken() decodes the cookie server-side only.
export async function validateSession(request: Request): Promise<App.Locals['user']> {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  if (!token?.sub || typeof token.email !== 'string') return null;

  const role = await getRole(token.sub);

  return {
    id: token.sub,
    email: token.email,
    name: typeof token.name === 'string' ? token.name : null,
    role,
  };
}
