import { describe, it, expect } from 'vitest';
import {
  MEMBER_ROUTE_PREFIXES,
  MOD_ROUTE_PREFIXES,
  ADMIN_ROUTE_PREFIXES,
  matchesPrefix,
  isApiRoute,
} from '../prefixes';

describe('ADMIN_ROUTE_PREFIXES', () => {
  it('includes /api/wizard as defense-in-depth for the wizard write routes', () => {
    expect(ADMIN_ROUTE_PREFIXES).toContain('/api/wizard');
  });

  it('still includes /admin', () => {
    expect(ADMIN_ROUTE_PREFIXES).toContain('/admin');
  });
});

describe('matchesPrefix', () => {
  it('matches an exact prefix', () => {
    expect(matchesPrefix('/admin', ADMIN_ROUTE_PREFIXES)).toBe(true);
  });

  it('matches /api/wizard/items (a nested wizard write route)', () => {
    expect(matchesPrefix('/api/wizard/items', ADMIN_ROUTE_PREFIXES)).toBe(true);
  });

  it('matches /api/wizard/set-product', () => {
    expect(matchesPrefix('/api/wizard/set-product', ADMIN_ROUTE_PREFIXES)).toBe(true);
  });

  it('matches nested route patterns like /api/wizard/attributes/bulk', () => {
    expect(matchesPrefix('/api/wizard/attributes/bulk', ADMIN_ROUTE_PREFIXES)).toBe(true);
  });

  it('does not match a route that merely shares the prefix string without a boundary', () => {
    // e.g. a hypothetical /api/wizardry route should not be swept in by the
    // /api/wizard prefix.
    expect(matchesPrefix('/api/wizardry', ADMIN_ROUTE_PREFIXES)).toBe(false);
  });

  it('does not match unrelated routes', () => {
    expect(matchesPrefix('/catalogue', ADMIN_ROUTE_PREFIXES)).toBe(false);
    expect(matchesPrefix('/catalogue', MEMBER_ROUTE_PREFIXES)).toBe(false);
    expect(matchesPrefix('/catalogue', MOD_ROUTE_PREFIXES)).toBe(false);
  });

  it('still matches the pre-existing member and moderator prefixes', () => {
    expect(matchesPrefix('/cart', MEMBER_ROUTE_PREFIXES)).toBe(true);
    expect(matchesPrefix('/checkout/confirm', MEMBER_ROUTE_PREFIXES)).toBe(true);
    expect(matchesPrefix('/orders/123', MEMBER_ROUTE_PREFIXES)).toBe(true);
    expect(matchesPrefix('/moderator/orders/[id]', MOD_ROUTE_PREFIXES)).toBe(true);
  });
});

describe('isApiRoute', () => {
  it('identifies /api/wizard/* routes as API routes', () => {
    expect(isApiRoute('/api/wizard/items')).toBe(true);
    expect(isApiRoute('/api/wizard/set-product')).toBe(true);
  });

  it('does not treat page routes as API routes', () => {
    expect(isApiRoute('/admin')).toBe(false);
    expect(isApiRoute('/cart')).toBe(false);
    expect(isApiRoute('/moderator/orders/[id]')).toBe(false);
  });

  // Regression test: adding /api/wizard to ADMIN_ROUTE_PREFIXES means an
  // unauthenticated request to a wizard write route now matches the
  // login-redirect branch in src/middleware/index.ts. Without this
  // isApiRoute check, that branch would redirect to /auth/login?next=/api/wizard/items,
  // and Auth.js's OAuth callback would then GET back to that same
  // POST-only route once sign-in completes — which 404s. isApiRoute lets
  // the middleware give API callers a plain 401 instead.
  it('is used to route API auth failures to 401 instead of a login redirect', () => {
    expect(isApiRoute('/api/wizard/archive')).toBe(true);
  });
});
