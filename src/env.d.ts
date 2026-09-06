/// <reference types="astro/client" />

import type { Role } from './lib/auth';

interface ImportMetaEnv {
  readonly BLOC_APPID: string;
  readonly OAUTH_CLIENT_SECRET: string;
  readonly REDIRECT_URL: string;
  readonly AUTH_SECRET: string;
  // TEMPORARY: bloc has no role endpoint yet (see docs/bloc-api.md) — these
  // are comma-separated bloc user ids treated as admin/moderator until a real
  // role API exists. See src/lib/auth.ts's getRole().
  readonly ADMIN_USER_IDS: string;
  readonly MODERATOR_USER_IDS: string;
}

// `import` above makes this file a module, so the App augmentation needs an
// explicit `declare global` to merge into the ambient namespace Astro reads.
declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        email: string;
        name: string | null;
        role: Role; // see src/lib/auth.ts's getRole() — allowlist for now, live API later
      } | null;
    }
  }
}
