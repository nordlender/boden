import type { Role } from './auth';

// Dev mode: swaps bloc OAuth for four fixed test users, one per role, picked
// from the navbar's user menu ("Change user") or the login page. Lets you
// reach member/board/moderator/admin pages without bloc credentials or your
// bloc id in ADMIN_USER_IDS etc.
//
// Enabled only at build time: DEV_MODE=true in .env. Astro inlines private
// `import.meta.env.*` values into the bundle when it builds (and when the dev
// server compiles a module), so this is a constant baked into the build — a
// running server can't be switched into dev mode, and a build made without
// the flag carries none of the dev users' code paths. Deliberately not read
// from process.env, which would make it a runtime switch.
export const DEV_MODE: boolean = import.meta.env.DEV_MODE === 'true';

// Must be exactly 'credentials': auth-astro's client signIn() only posts to
// /callback/<id> (the credentials flow) for that id; any other id is treated
// as OAuth and bounces to /api/auth/signin.
export const DEV_PROVIDER_ID = 'credentials';

export interface DevUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// Ids are deliberately non-numeric so they can't collide with bloc's numeric
// user ids (see upsertUser.ts's id-scheme heuristic).
export const ALL_DEV_USERS: readonly DevUser[] = [
  { id: 'dev-jane', name: 'Jane', email: 'jane@dev.invalid', role: 'member' },
  { id: 'dev-bob', name: 'Bob', email: 'bob@dev.invalid', role: 'board' },
  { id: 'dev-mandy', name: 'Mandy', email: 'mandy@dev.invalid', role: 'moderator' },
  { id: 'dev-amitda', name: 'Amitda', email: 'amitda@dev.invalid', role: 'admin' },
];

// Empty unless dev mode is on, so a normal build carries no test users at all
// (ALL_DEV_USERS is then unreferenced and tree-shaken out). Everything outside
// tests goes through this, never ALL_DEV_USERS.
export const DEV_USERS: readonly DevUser[] = DEV_MODE ? ALL_DEV_USERS : [];

// The dev user with this id, or undefined if it isn't one / dev mode is off.
export function findDevUser(userId: unknown, users: readonly DevUser[] = DEV_USERS): DevUser | undefined {
  if (typeof userId !== 'string') return undefined;
  return users.find((u) => u.id === userId);
}
