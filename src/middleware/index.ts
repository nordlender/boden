import { defineMiddleware } from 'astro:middleware';
import { validateSession } from '../lib/auth';
import { MEMBER_ROUTE_PREFIXES, MOD_ROUTE_PREFIXES, ADMIN_ROUTE_PREFIXES, matchesPrefix, isApiRoute } from './prefixes';

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
    // API routes (e.g. /api/wizard/*) are form-POST/fetch targets, not
    // something a browser navigates to — redirecting them into the OAuth
    // login dance means Auth.js's callback then does a GET back to that
    // same POST-only route once sign-in completes, which 404s. Give API
    // callers a plain 401 instead; only page routes get the login redirect.
    if (isApiRoute(routePattern)) {
      return new Response('Unauthorized', { status: 401 });
    }
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
