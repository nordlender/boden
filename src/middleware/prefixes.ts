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
export const MEMBER_ROUTE_PREFIXES = ['/cart', '/checkout', '/orders'];
export const MOD_ROUTE_PREFIXES = ['/moderator'];
// /api/wizard is included here as defense-in-depth: the five /api/wizard/*
// write routes (archive, attributes, attributes/bulk, items, set-product)
// each already re-implement their own `locals.user?.role !== 'admin'` check
// inline (see those files), so this is redundant today — but it means a
// future wizard route that forgets the inline check isn't left with zero
// protection.
export const ADMIN_ROUTE_PREFIXES = ['/admin', '/api/wizard'];

export function matchesPrefix(routePattern: string, prefixes: string[]) {
  return prefixes.some((p) => routePattern === p || routePattern.startsWith(`${p}/`));
}

// API routes are form-POST/fetch targets, not something a browser navigates
// to — an unauthenticated request to one should get a plain 401, not a
// redirect into the OAuth login flow (Auth.js's callback would then GET back
// to that same POST-only route once sign-in completes, which 404s).
export function isApiRoute(routePattern: string): boolean {
  return routePattern.startsWith('/api/');
}
