import { describe, it, expect } from 'vitest';
import {
  requireAdmin,
  requireModerator,
  safeRedirectTarget,
  isPositiveInteger,
  parseIdParam,
  withQueryParam,
  withErrorParam,
  json,
  jsonError,
  readJsonObject,
} from '../http';

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

  it('normalizes a non-canonical origin (trailing slash) before comparing', () => {
    expect(safeRedirectTarget(formWithRedirect('/admin/items/42'), `${ORIGIN}/`)).toBe('/admin/items/42');
  });

  it('normalizes an origin passed as a full URL with a path', () => {
    expect(safeRedirectTarget(formWithRedirect('/admin/items/42'), `${ORIGIN}/admin/items`)).toBe(
      '/admin/items/42',
    );
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

  it('returns a 401 Response when there is no user', () => {
    const res = requireAdmin({ user: null } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(401);
  });

  it('returns a 403 Response when the user is not an admin', () => {
    const res = requireAdmin({ user: { id: '1', email: 'a@b.com', name: null, role: 'member' } } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(403);
  });
});

describe('requireModerator', () => {
  it('returns null when the user is a moderator', () => {
    expect(
      requireModerator({ user: { id: '1', email: 'a@b.com', name: null, role: 'moderator' } } as never),
    ).toBeNull();
  });

  it('returns null when the user is an admin, since admins always have at least moderator permissions', () => {
    expect(requireModerator({ user: { id: '1', email: 'a@b.com', name: null, role: 'admin' } } as never)).toBeNull();
  });

  it('returns a 401 Response when there is no user', () => {
    const res = requireModerator({ user: null } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(401);
  });

  it('returns a 403 Response when the user is a plain member', () => {
    const res = requireModerator({ user: { id: '1', email: 'a@b.com', name: null, role: 'member' } } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(403);
  });
});

describe('parseIdParam', () => {
  it('parses a positive integer id', () => {
    expect(parseIdParam('42')).toBe(42);
  });

  it('returns null for missing, zero, negative, fractional or non-numeric ids', () => {
    for (const value of [undefined, '', '0', '-3', '1.5', 'abc']) {
      expect(parseIdParam(value)).toBeNull();
    }
  });
});

describe('withQueryParam / withErrorParam', () => {
  it('adds a param to a bare path', () => {
    expect(withErrorParam('/admin', 'empty_message')).toBe('/admin?error=empty_message');
  });

  it('keeps an existing query string and fragment', () => {
    expect(withQueryParam('/products/rope?item=3#top', 'cartOpen', '1')).toBe('/products/rope?item=3&cartOpen=1#top');
  });

  it('replaces an existing value for the same key', () => {
    expect(withErrorParam('/admin?error=old', 'new')).toBe('/admin?error=new');
  });
});

describe('json / jsonError', () => {
  it('serializes data with a JSON content type and default 200 status', async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('wraps an error code', async () => {
    const res = jsonError('not_found', 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

describe('readJsonObject', () => {
  const req = (body: string) => new Request('https://x.test', { method: 'POST', body });

  it('returns a parsed JSON object', async () => {
    expect(await readJsonObject(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it('returns null for malformed JSON and for non-object JSON values', async () => {
    for (const body of ['{oops', 'null', '[1,2]', '"text"', '3']) {
      expect(await readJsonObject(req(body))).toBeNull();
    }
  });
});
