import { defineMiddleware } from 'astro:middleware';
import { validateSession, hasRole } from '../lib/auth';
import type { BlocAccess } from '../lib/blocToken';
import { requiredRole, isApiRoute } from './prefixes';

export const onRequest = defineMiddleware(async (ctx, next) => {
  // Prerendered routes (shop grid shell, login, 404) are built once, ahead of
  // any request — there's no real per-visitor Request here, so a session
  // lookup is both meaningless and throws Astro's own warning
  // ("Astro.request.headers ... not available on prerendered pages").
  if (ctx.isPrerendered) {
    ctx.locals.user = null;
    ctx.locals.blocAccess = async () => ({ userId: null, accessToken: null, error: 'NoSession' });
    return next();
  }

  // Must be called before the response starts streaming (page frontmatter /
  // endpoint body), since a refresh re-issues the session cookie. Imported
  // lazily: blocSession.ts pulls in the whole Auth.js config (src/auth.ts),
  // which shouldn't load for every middleware run — or at all while
  // prerendering.
  let blocAccess: Promise<BlocAccess> | undefined;
  ctx.locals.blocAccess = () =>
    (blocAccess ??= import('../lib/blocSession').then(({ resolveBlocAccess }) =>
      resolveBlocAccess(ctx.request, ctx.cookies),
    ));

  const user = await validateSession(ctx.request);
  ctx.locals.user = user;

  const { routePattern } = ctx;
  const minRole = requiredRole(routePattern);

  if (minRole && !user) {
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

  if (minRole && !hasRole(user?.role, minRole)) {
    return new Response('Forbidden', { status: 403 });
  }

  return next();
});
