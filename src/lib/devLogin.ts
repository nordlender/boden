import type { Role } from './auth';

// Opt-in, dev-only login (#270). Lets contributors reach member/moderator/admin
// pages without bloc OAuth credentials or their bloc id in ADMIN_USER_IDS.
//
// Layered guards so it can never reach production:
//  1. Every gate requires `import.meta.env.DEV`, which Vite replaces with the
//     literal `false` in `astro build` — call sites in src/auth.ts are written
//     so the provider is dead-code-eliminated from production bundles.
//  2. assertDevLoginSafe() throws at server start if DEV_LOGIN is set in a
//     non-dev build, rather than silently ignoring it.
//  3. Dev users only get roles via getRole() while isDevLoginEnabled() is
//     true; their synthetic ids are never consulted otherwise.

// Must be exactly 'credentials': auth-astro's client signIn() only posts to
// /callback/<id> (the credentials flow) for that id; any other id is treated as
// OAuth and bounces to /api/auth/signin.
export const DEV_LOGIN_PROVIDER_ID = 'credentials';

// Synthetic users: ids are deliberately non-numeric so they can't collide
// with bloc's numeric ids (see upsertUser.ts's id-scheme heuristic).
export const DEV_USERS: Record<Role, { id: string; name: string; email: string }> = {
  admin: { id: 'dev-admin', name: 'Dev Admin', email: 'dev-admin@dev.invalid' },
  board: { id: 'dev-board', name: 'Dev Board', email: 'dev-board@dev.invalid' },
  moderator: { id: 'dev-moderator', name: 'Dev Moderator', email: 'dev-moderator@dev.invalid' },
  member: { id: 'dev-member', name: 'Dev Member', email: 'dev-member@dev.invalid' },
};

export function isDevRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.hasOwn(DEV_USERS, value);
}

// Astro exposes .env values on import.meta.env, while a shell-exported
// DEV_LOGIN=1 lands on process.env — honour either.
export function readDevLoginFlag(): string | undefined {
  return import.meta.env.DEV_LOGIN ?? process.env.DEV_LOGIN;
}

export function isDevLoginEnabled(dev: boolean = import.meta.env.DEV, flag: string | undefined = readDevLoginFlag()): boolean {
  return dev === true && flag === '1';
}

export function assertDevLoginSafe(dev: boolean = import.meta.env.DEV, flag: string | undefined = readDevLoginFlag()): void {
  if (!dev && flag !== undefined && flag !== '') {
    throw new Error('DEV_LOGIN is set in a production build — refusing to start. Unset DEV_LOGIN.');
  }
}

// Role for a dev user id, or null if the id isn't a dev user / dev login is off.
export function devRoleForUserId(userId: string, enabled: boolean = isDevLoginEnabled()): Role | null {
  if (!enabled) return null;
  for (const [role, user] of Object.entries(DEV_USERS)) {
    if (user.id === userId) return role as Role;
  }
  return null;
}
