import { describe, it, expect } from 'vitest';
import { requiredRole, matchesPrefix, isApiRoute } from '../prefixes';

describe('matchesPrefix', () => {
  it('matches an exact prefix and nested routes', () => {
    expect(matchesPrefix('/admin', '/admin')).toBe(true);
    expect(matchesPrefix('/api/wizard/items', '/api/wizard')).toBe(true);
  });

  it('does not match a route that merely shares the prefix string without a boundary', () => {
    expect(matchesPrefix('/api/wizardry', '/api/wizard')).toBe(false);
  });
});

describe('requiredRole', () => {
  it('requires admin for admin routes', () => {
    expect(requiredRole('/admin')).toBe('admin');
    expect(requiredRole('/api/wizard/items')).toBe('admin');
    expect(requiredRole('/api/admin/pickup-days')).toBe('admin');
  });

  it('requires moderator for moderator routes, incl. messages add/delete (#225)', () => {
    expect(requiredRole('/moderator/orders/[id]')).toBe('moderator');
    expect(requiredRole('/api/moderator/retrieve')).toBe('moderator');
    expect(requiredRole('/api/messages/add')).toBe('moderator');
    expect(requiredRole('/api/messages/delete')).toBe('moderator');
  });

  it('keeps messages pin/unpin admin-only', () => {
    expect(requiredRole('/api/messages/pin')).toBe('admin');
    expect(requiredRole('/api/messages/unpin')).toBe('admin');
  });

  it('requires member for signed-in routes', () => {
    expect(requiredRole('/cart')).toBe('member');
    expect(requiredRole('/checkout/confirm')).toBe('member');
    expect(requiredRole('/orders/123')).toBe('member');
    expect(requiredRole('/api/orders')).toBe('member');
  });

  it('returns null for public routes', () => {
    expect(requiredRole('/catalogue')).toBeNull();
    expect(requiredRole('/api/wizardry')).toBeNull();
  });
});

describe('isApiRoute', () => {
  it('identifies API routes', () => {
    expect(isApiRoute('/api/wizard/items')).toBe(true);
  });

  it('does not treat page routes as API routes', () => {
    expect(isApiRoute('/admin')).toBe(false);
    expect(isApiRoute('/cart')).toBe(false);
  });
});
