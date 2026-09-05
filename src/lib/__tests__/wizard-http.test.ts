import { describe, it, expect } from 'vitest';
import { requireAdmin, safeRedirectTarget, isPositiveInteger } from '../wizard-http';

const ORIGIN = 'https://shop.example.com';

function formWithRedirect(redirectTo?: unknown): FormData {
  const form = new FormData();
  if (redirectTo !== undefined) {
    // FormData.set coerces non-string, non-Blob values to strings; the tests
    // that want a genuinely non-string value skip calling set() and instead
    // assert the "field missing" fallback path, since FormData cannot hold a
    // non-string, non-Blob value.
    form.set('redirectTo', redirectTo as string);
  }
  return form;
}

describe('safeRedirectTarget', () => {
  it('passes through a same-origin absolute path', () => {
    expect(safeRedirectTarget(formWithRedirect('/admin/items/42'), ORIGIN)).toBe('/admin/items/42');
  });

  it('preserves query string and hash on a same-origin path', () => {
    expect(safeRedirectTarget(formWithRedirect('/admin/items?tab=archived#foo'), ORIGIN)).toBe(
      '/admin/items?tab=archived#foo',
    );
  });

  it('falls back to /admin/items for a protocol-relative URL (open redirect)', () => {
    expect(safeRedirectTarget(formWithRedirect('//evil.com/x'), ORIGIN)).toBe('/admin/items');
  });

  it('falls back to /admin/items for an absolute cross-origin URL', () => {
    expect(safeRedirectTarget(formWithRedirect('https://evil.com'), ORIGIN)).toBe('/admin/items');
  });

  it('falls back to /admin/items for an absolute cross-origin URL with a matching-looking path', () => {
    expect(safeRedirectTarget(formWithRedirect('https://evil.com/admin/items'), ORIGIN)).toBe('/admin/items');
  });

  it('falls back to /admin/items when redirectTo is missing', () => {
    expect(safeRedirectTarget(formWithRedirect(), ORIGIN)).toBe('/admin/items');
  });

  it('falls back to /admin/items when redirectTo does not start with a slash', () => {
    expect(safeRedirectTarget(formWithRedirect('admin/items'), ORIGIN)).toBe('/admin/items');
  });

  it('falls back to /admin/items for a non-string redirectTo (e.g. a File)', () => {
    const form = new FormData();
    form.set('redirectTo', new File(['x'], 'x.txt'));
    expect(safeRedirectTarget(form, ORIGIN)).toBe('/admin/items');
  });
});

describe('isPositiveInteger', () => {
  it('rejects the falsy-zero produced by Number(null) or Number("") — a missing/empty form field', () => {
    expect(isPositiveInteger(Number(null))).toBe(false);
    expect(isPositiveInteger(Number(''))).toBe(false);
    expect(isPositiveInteger(0)).toBe(false);
  });

  it('rejects negative numbers and non-integers', () => {
    expect(isPositiveInteger(-1)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger(NaN)).toBe(false);
  });

  it('accepts a positive integer', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(42)).toBe(true);
  });
});

describe('requireAdmin', () => {
  it('returns null when the user is an admin', () => {
    expect(requireAdmin({ user: { id: '1', email: 'a@b.com', name: null, role: 'admin' } } as never)).toBeNull();
  });

  it('returns a 403 Response when there is no user', () => {
    const res = requireAdmin({ user: null } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(403);
  });

  it('returns a 403 Response when the user is not an admin', () => {
    const res = requireAdmin({ user: { id: '1', email: 'a@b.com', name: null, role: 'member' } } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(403);
  });
});
