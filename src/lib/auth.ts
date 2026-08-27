import { getToken } from '@auth/core/jwt';

export type Role = 'admin' | 'moderator' | 'member';

// Roles are never stored in our database — fetched live from the external
// role API on every request (rental_shop.md §7). ROLE_API_URL is currently a
// placeholder; wiring it to the real bloc endpoint is deferred until
// bloc_api_handoff.md's exploration reports a confirmed response shape and a
// human signs off (see auth_work_items.md decision 2 / hard rules).
const CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { role: Role; fetchedAt: number }>();

export async function getRoleFromExternalApi(accessToken: string, cacheKey: string): Promise<Role> {
  const cached = roleCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.role;
  }

  let role: Role = 'member';
  try {
    const res = await fetch(import.meta.env.ROLE_API_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      role = data.role === 'admin' || data.role === 'moderator' ? data.role : 'member';
    }
  } catch {
    // unreachable API — safe-downgrade to 'member' below
  }

  roleCache.set(cacheKey, { role, fetchedAt: Date.now() });
  return role;
}

// Auth.js doesn't expose a bare session-id cookie (only the signed JWT), so
// this decodes the JWT directly (auth_work_items.md decision 1 — role cache
// keys off user.id, not a session id). Uses @auth/core/jwt's getToken()
// rather than auth-astro's getSession(): getSession() returns the same shape
// served to client JS via /api/auth/session, which must never carry the raw
// bloc access token — getToken() decodes the cookie server-side only.
export async function validateSession(request: Request): Promise<App.Locals['user']> {
  const token = await getToken({ req: request, secret: import.meta.env.AUTH_SECRET });
  if (!token?.sub || typeof token.email !== 'string') return null;

  const accessToken = typeof token.accessToken === 'string' ? token.accessToken : undefined;
  const role = accessToken ? await getRoleFromExternalApi(accessToken, token.sub) : 'member';

  return {
    id: token.sub,
    email: token.email,
    name: typeof token.name === 'string' ? token.name : null,
    role,
  };
}
