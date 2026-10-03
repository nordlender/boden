// Route-prefix tables and matcher extracted from ./index.ts so they can be
// unit tested without pulling in the `astro:middleware` virtual module
// (which only resolves inside Astro's own build/dev runtime, not plain
// vitest).
//
// Matched against ctx.routePattern (Astro's own resolved route, e.g.
// '/moderator/orders/[id]') — not ctx.url.pathname. Astro's auth guide warns
// that raw-pathname string matching (`.startsWith(...)`) can be bypassed: a
// configured `base`, URL encoding, or duplicate slashes can make the pathname
// middleware sees differ from the route Astro actually matches internally.
// routePattern is Astro's own route resolution, so there's no such gap to
// exploit. https://docs.astro.build/en/guides/authentication/
import type { Role } from '../lib/auth';

export interface RouteRule {
  prefix: string;
  minRole: Role;
}

// Ordered; first match wins, so put more specific prefixes before broader
// ones. Many /api entries are redundant with the inline checks in those
// endpoints (defense in depth: a future route that forgets its inline check
// isn't left unprotected). Moderators may add/delete messages (#225);
// pin/unpin stay admin-only.
export const ROUTE_RULES: RouteRule[] = [
  { prefix: '/admin', minRole: 'admin' },
  { prefix: '/api/wizard', minRole: 'admin' },
  { prefix: '/api/products', minRole: 'admin' },
  { prefix: '/api/admin/pickup-days', minRole: 'admin' },
  { prefix: '/api/admin/images', minRole: 'admin' },
  { prefix: '/api/messages/pin', minRole: 'admin' },
  { prefix: '/api/messages/unpin', minRole: 'admin' },
  { prefix: '/moderator', minRole: 'moderator' },
  { prefix: '/api/moderator', minRole: 'moderator' },
  { prefix: '/api/messages/add', minRole: 'moderator' },
  { prefix: '/api/messages/delete', minRole: 'moderator' },
  { prefix: '/cart', minRole: 'member' },
  { prefix: '/checkout', minRole: 'member' },
  { prefix: '/orders', minRole: 'member' },
  { prefix: '/reservation', minRole: 'member' },
  { prefix: '/api/reservation', minRole: 'member' },
  { prefix: '/api/orders', minRole: 'member' },
];

export function matchesPrefix(routePattern: string, prefix: string) {
  return routePattern === prefix || routePattern.startsWith(`${prefix}/`);
}

// Minimum role needed for a route, or null if it's public.
export function requiredRole(routePattern: string): Role | null {
  return ROUTE_RULES.find((r) => matchesPrefix(routePattern, r.prefix))?.minRole ?? null;
}

// API routes are form-POST/fetch targets, not something a browser navigates
// to — an unauthenticated request to one should get a plain 401, not a
// redirect into the OAuth login flow (Auth.js's callback would then GET back
// to that same POST-only route once sign-in completes, which 404s).
export function isApiRoute(routePattern: string): boolean {
  return routePattern.startsWith('/api/');
}
