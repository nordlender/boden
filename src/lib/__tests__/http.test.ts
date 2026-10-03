import { describe, it, expect } from 'vitest';
import {
  requireAdmin,
  requireModerator,
  requireUser,
  safeRedirectTarget,
  isPositiveInteger,
  json,
  jsonError,
  redirectWithError,
  parseIdParam,
  readJson,
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

describe('requireUser', () => {
  it('returns a 401 Response when there is no user', () => {
    expect(requireUser({ user: null } as never)?.status).toBe(401);
  });

  it('returns null for a signed-in user', () => {
    expect(requireUser({ user: { id: '1', email: 'a@b.com', name: null, role: 'member' } } as never)).toBeNull();
  });
});

describe('json / jsonError', () => {
  it('sets status 200 and a JSON Content-Type by default', async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('uses the given status', () => {
    expect(json({ a: 1 }, 201).status).toBe(201);
  });

  it('jsonError wraps the code as { error } with the status', async () => {
    const res = jsonError('invalid_id', 400);
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ error: 'invalid_id' });
  });
});

describe('redirectWithError', () => {
  it('appends ?error= to a plain path', () => {
    expect(redirectWithError('/cart', 'empty_cart')).toBe('/cart?error=empty_cart');
  });

  it('preserves an existing query string', () => {
    expect(redirectWithError('/admin?tab=a', 'oops')).toBe('/admin?tab=a&error=oops');
  });

  it('replaces an existing error param and keeps the hash', () => {
    expect(redirectWithError('/admin?error=old#x', 'new')).toBe('/admin?error=new#x');
  });

  it('url-encodes the code', () => {
    expect(redirectWithError('/a', 'a b')).toBe('/a?error=a+b');
  });
});

describe('parseIdParam', () => {
  it('parses a positive integer string', () => {
    expect(parseIdParam('42')).toBe(42);
  });

  it.each([undefined, null, '', '0', '-1', '1.5', 'abc', '12abc', ' 1', '1e3'])('returns null for %j', (v) => {
    expect(parseIdParam(v as string | undefined)).toBeNull();
  });
});

describe('readJson', () => {
  const req = (body: string | null) => new Request('https://x/', { method: 'POST', body });

  it('returns the parsed object', async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it('returns null for malformed JSON', async () => {
    expect(await readJson(req('{nope'))).toBeNull();
  });

  it('returns null for an empty body', async () => {
    expect(await readJson(req(null))).toBeNull();
  });

  it('returns null for a literal null body', async () => {
    expect(await readJson(req('null'))).toBeNull();
  });

  it('returns null for non-object JSON (array, number)', async () => {
    expect(await readJson(req('[1]'))).toBeNull();
    expect(await readJson(req('5'))).toBeNull();
  });
});
