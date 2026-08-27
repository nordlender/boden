/// <reference types="astro/client" />

import type { Role } from './lib/auth';

interface ImportMetaEnv {
  readonly BLOC_APPID: string;
  readonly OAUTH_CLIENT_SECRET: string;
  readonly REDIRECT_URL: string;
  readonly ROLE_API_URL: string;
  readonly AUTH_SECRET: string;
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
        role: Role; // always freshly fetched from the external API, never from our DB
      } | null;
    }
  }
}
