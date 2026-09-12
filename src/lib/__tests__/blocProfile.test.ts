import { describe, it, expect } from 'vitest';
import { getBlocProfile, type BlocProfile } from '../blocProfile';

// getBlocProfile centralizes the `profile as unknown as BlocProfile` cast used
// by both signIn and jwt in src/auth.ts to read bloc's own numeric userId out
// of the raw OAuth profile object (see #59 — Auth.js overwrites `user.id`
// with a fresh UUID before those callbacks run, so this raw `profile` is the
// only place that still carries bloc's real id).
describe('getBlocProfile', () => {
  const wellFormed: BlocProfile = {
    userId: 482913,
    username: 'carol',
    firstname: 'Carol',
    lastname: 'Baskin',
    email: 'carol@example.com',
    mobile: '+1234567890',
    image: null,
    profileTypeId: 0,
    hasUnpaidFees: false,
    userIsMember: true,
    success: true,
    code: 0,
    message: null,
  };

  it('returns the profile object with the expected userId for a well-formed profile', () => {
    const result = getBlocProfile(wellFormed);
    expect(result).toBe(wellFormed);
    expect(result?.userId).toBe(482913);
    expect(typeof result?.userId).toBe('number');
  });

  it('returns undefined (not a throw) for undefined input', () => {
    expect(() => getBlocProfile(undefined)).not.toThrow();
    expect(getBlocProfile(undefined)).toBeUndefined();
  });

  it('does not throw for null input - it is a plain cast, so null passes through unchanged rather than becoming undefined', () => {
    expect(() => getBlocProfile(null)).not.toThrow();
    expect(getBlocProfile(null)).toBeNull();
  });

  it('does not throw or coerce when userId is missing - it is a plain cast, so the field just comes back undefined', () => {
    const noUserId = { username: 'noid', email: 'noid@example.com' };
    const result = getBlocProfile(noUserId);
    expect(result).toBeDefined();
    expect(result?.userId).toBeUndefined();
  });

  it('passes through an unrelated object shape unchanged (it is a cast, not a validator)', () => {
    const somethingElse = { foo: 'bar' };
    const result = getBlocProfile(somethingElse);
    expect(result).toBe(somethingElse as unknown as BlocProfile);
  });
});
