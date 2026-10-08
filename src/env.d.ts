/// <reference types="astro/client" />

import type { Role } from './lib/auth';
import type { BlocAccess } from './lib/blocToken';

interface ImportMetaEnv {
  readonly BLOC_APPID: string;
  readonly OAUTH_CLIENT_SECRET: string;
  readonly REDIRECT_URL: string;
  readonly AUTH_SECRET: string;
  // TEMPORARY: bloc has no role endpoint yet (see docs/bloc-api.md) — these
  // are comma-separated bloc user ids treated as admin/board/moderator until a
  // real role API exists. See src/lib/auth.ts's getRole().
  readonly ADMIN_USER_IDS: string;
  readonly BOARD_USER_IDS: string;
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
      // The caller's bloc access token for server-side bloc calls, refreshed
      // first if due (src/lib/blocSession.ts, #319). Lazy + memoized: the
      // JWT is only decoded (and a refresh only attempted) when a route
      // actually calls it. Never pass the token to client code.
      blocAccess: () => Promise<BlocAccess>;
    }
  }
}
