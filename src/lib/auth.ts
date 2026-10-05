import { getToken } from '@auth/core/jwt';
import { devRoleForUserId } from './devLogin';

export type Role = 'admin' | 'board' | 'moderator' | 'member';

// Role hierarchy is member < moderator < board < admin. Every "is this user
// at least X" check must go through hasRole() rather than comparing roles
// directly, so higher roles are never accidentally excluded.
export const ROLE_RANK: Record<Role, number> = {
  member: 0,
  moderator: 1,
  board: 2,
  admin: 3,
};

export function hasRole(role: Role | undefined | null, min: Role): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[min];
}

// TEMPORARY: bloc doesn't expose a role endpoint yet (see
// docs/bloc-api.md), so admin/board/moderator status is a hardcoded allowlist
// of bloc user ids (ADMIN_USER_IDS / BOARD_USER_IDS / MODERATOR_USER_IDS in
// .env, comma-separated) rather than a live external lookup. getRole()'s
// signature (userId in, Role out) is deliberately the same shape a real
// getRoleFromExternalApi(accessToken, cacheKey) would have, so swapping the
// body for a real fetch once bloc ships a role endpoint shouldn't require
// touching validateSession() or the middleware.
function parseIdAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

const ADMIN_USER_IDS = parseIdAllowlist(import.meta.env.ADMIN_USER_IDS);
const BOARD_USER_IDS = parseIdAllowlist(import.meta.env.BOARD_USER_IDS);
const MODERATOR_USER_IDS = parseIdAllowlist(import.meta.env.MODERATOR_USER_IDS);

// Plain synchronous lookup; add caching back only once a real bloc role API
// exists (#22).
export function getRole(userId: string): Role {
  // Synthetic dev-login ids (#270); null unless DEV_LOGIN is active in dev.
  const devRole = devRoleForUserId(userId);
  if (devRole) return devRole;
  if (ADMIN_USER_IDS.has(userId)) return 'admin';
  if (BOARD_USER_IDS.has(userId)) return 'board';
  if (MODERATOR_USER_IDS.has(userId)) return 'moderator';
  return 'member';
}

// Auth.js doesn't expose a bare session-id cookie (only the signed JWT), so
// this decodes the JWT directly. Uses @auth/core/jwt's getToken() rather than
// auth-astro's getSession(): getSession() returns the same shape served to
// client JS via /api/auth/session, which must never carry the raw bloc access
// token — getToken() decodes the cookie server-side only.
export async function validateSession(request: Request): Promise<App.Locals['user']> {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  if (!token?.sub || typeof token.email !== 'string') return null;

  const role = getRole(token.sub);

  return {
    id: token.sub,
    email: token.email,
    name: typeof token.name === 'string' ? token.name : null,
    role,
  };
}
