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
    return cached.role;
  }

  const role: Role = ADMIN_USER_IDS.has(userId)
    ? 'admin'
    : MODERATOR_USER_IDS.has(userId)
      ? 'moderator'
      : 'member';

  roleCache.set(userId, { role, fetchedAt: Date.now() });
  return role;
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
