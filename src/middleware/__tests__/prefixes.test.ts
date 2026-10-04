import { describe, it, expect } from 'vitest';
import { requiredRole, matchesPrefix, isApiRoute } from '../prefixes';

describe('matchesPrefix', () => {
  it.each([
    ['/admin', '/admin', 'an exact prefix'],
    ['/api/wizard/items', '/api/wizard', 'a nested wizard write route'],
    ['/api/products/[id]/update', '/api/products', 'a nested product write route'],
  ])('matches %s against %s (%s)', (route, prefix) => {
    expect(matchesPrefix(route, prefix)).toBe(true);
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
    expect(requiredRole('/api/admin/images')).toBe('admin');
    expect(requiredRole('/api/products/create')).toBe('admin');
    expect(requiredRole('/api/products/[id]/update')).toBe('admin');
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
    expect(requiredRole('/reservation/confirm')).toBe('member');
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
    expect(isApiRoute('/reservation')).toBe(false);
  });
});
