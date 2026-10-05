import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEV_USERS, assertDevLoginSafe, devRoleForUserId, isDevLoginEnabled, isDevRole } from '../devLogin';

describe('dev login guards (#270)', () => {
  it('is off by default', () => {
    expect(isDevLoginEnabled(true, undefined)).toBe(false);
    expect(isDevLoginEnabled(true, '')).toBe(false);
    expect(isDevLoginEnabled(true, '0')).toBe(false);
  });

  it('is on only with DEV and an explicit DEV_LOGIN=1', () => {
    expect(isDevLoginEnabled(true, '1')).toBe(true);
  });

  it('is never enabled in a production build, even with the flag set', () => {
    expect(isDevLoginEnabled(false, '1')).toBe(false);
  });

  it('refuses to start in production when DEV_LOGIN is set', () => {
    expect(() => assertDevLoginSafe(false, '1')).toThrow(/DEV_LOGIN/);
    expect(() => assertDevLoginSafe(false, '0')).toThrow(/DEV_LOGIN/);
    expect(() => assertDevLoginSafe(false, undefined)).not.toThrow();
    expect(() => assertDevLoginSafe(true, '1')).not.toThrow();
  });

  it('maps dev user ids to roles only while enabled', () => {
    for (const [role, user] of Object.entries(DEV_USERS)) {
      expect(devRoleForUserId(user.id, true)).toBe(role);
      expect(devRoleForUserId(user.id, false)).toBeNull();
    }
    expect(devRoleForUserId('12345', true)).toBeNull();
  });

  it('validates roles', () => {
    expect(isDevRole('admin')).toBe(true);
    expect(isDevRole('root')).toBe(false);
    expect(isDevRole('toString')).toBe(false);
  });
});

describe('production auth config', () => {
  // src/auth.ts registers the provider behind a literal `import.meta.env.DEV`
  // gate, which Vite folds to `false` in `astro build`. Assert that gate is
  // still there so a refactor can't silently ungate it.
  it('gates the dev provider on import.meta.env.DEV at registration', () => {
    const src = readFileSync(new URL('../../auth.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/import\.meta\.env\.DEV && isDevLoginEnabled\(\) \? \[DevLogin\(\)\]/);
    expect(src).toMatch(/^assertDevLoginSafe\(\);$/m);
  });
});
