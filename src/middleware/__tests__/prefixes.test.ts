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

  it('matches a nested wizard write route', () => {
    expect(matchesPrefix('/api/wizard/items', ADMIN_ROUTE_PREFIXES)).toBe(true);
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

  it('matches /api/moderator/* routes (defense-in-depth for moderator write routes)', () => {
    expect(matchesPrefix('/api/moderator/retrieve', MOD_ROUTE_PREFIXES)).toBe(true);
    expect(matchesPrefix('/api/moderator/orders/[id]/accept', MOD_ROUTE_PREFIXES)).toBe(true);
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
});
