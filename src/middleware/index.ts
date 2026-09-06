import { defineMiddleware } from 'astro:middleware';
import { validateSession } from '../lib/auth';

// Matched against ctx.routePattern (Astro's own resolved route, e.g.
// '/moderator/orders/[id]') — not ctx.url.pathname. Astro's auth guide warns
// that raw-pathname string matching (`.startsWith(...)`) can be bypassed: a
// configured `base`, URL encoding, or duplicate slashes can make the pathname
// middleware sees differ from the route Astro actually matches internally.
// routePattern is Astro's own route resolution, so there's no such gap to
// exploit. https://docs.astro.build/en/guides/authentication/
const MEMBER_ROUTE_PREFIXES = ['/cart', '/checkout', '/orders'];
const MOD_ROUTE_PREFIXES = ['/moderator'];
const ADMIN_ROUTE_PREFIXES = ['/admin'];

function matchesPrefix(routePattern: string, prefixes: string[]) {
  return prefixes.some((p) => routePattern === p || routePattern.startsWith(`${p}/`));
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  // Prerendered routes (the catalogue, item pages) are built once, ahead of
  // any request — there's no real per-visitor Request here, so a session
  // lookup is both meaningless and throws Astro's own warning
  // ("Astro.request.headers ... not available on prerendered pages").
  if (ctx.isPrerendered) {
    ctx.locals.user = null;
    return next();
  }

  const user = await validateSession(ctx.request);
  ctx.locals.user = user;

  const { routePattern } = ctx;
  const allProtectedPrefixes = [...MEMBER_ROUTE_PREFIXES, ...MOD_ROUTE_PREFIXES, ...ADMIN_ROUTE_PREFIXES];

  if (matchesPrefix(routePattern, allProtectedPrefixes) && !user) {
    // next= is a redirect target for the human, not a security check — the
    // actual pathname (not the routePattern's [id]-style placeholder) is
    // correct here.
    return ctx.redirect(`/auth/login?next=${encodeURIComponent(ctx.url.pathname)}`);
  }

  if (matchesPrefix(routePattern, MOD_ROUTE_PREFIXES) && user?.role === 'member') {
    return new Response('Forbidden', { status: 403 });
  }

  if (matchesPrefix(routePattern, ADMIN_ROUTE_PREFIXES) && user?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  return next();
});
