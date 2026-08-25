import type { OAuthConfig, OAuthUserConfig } from '@auth/core/providers';
import type { TokenSet } from '@auth/core/types';
import { defineConfig } from 'auth-astro';

declare module '@auth/core/types' {
  interface Session {
    accessToken?: string;
    // bloc profile fields carried through the session for the auth session's
    // lifetime, for later order-form autofill — see session_variables.json.
    // Nested under `bloc` (rather than flattened) because Auth.js's built-in
    // AdapterSession type already declares a required `userId: string`, which
    // collides with ours if placed at the top level.
    bloc?: {
      userId: number;
      mobile: string | null;
      profileTypeId: number;
      hasUnpaidFees: boolean | null;
      userIsMember: boolean | null;
      success: boolean;
      code: number;
      message: string | null;
    };
  }
}

interface BlocProfile {
  userId: number;
  username: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  mobile: string | null;
  image: string | null;
  profileTypeId: number;
  hasUnpaidFees: boolean | null;
  userIsMember: boolean | null;
  success: boolean;
  code: number;
  message: string | null;
}

// bloc (rest.bloc.net) as OAuth2 identity provider. Not one of Auth.js's built-in
// named providers, so this is a hand-rolled generic OAuthConfig — see
// auth_work_items.md for the confirmed authorize/token endpoints.
function Bloc(config: OAuthUserConfig<BlocProfile>): OAuthConfig<BlocProfile> {
  return {
    id: 'bloc',
    name: 'bloc',
    type: 'oauth',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorization: {
      url: 'https://rest.bloc.net/OAuth/Authorize',
      params: { response_type: 'code' },
    },
    token: 'https://rest.bloc.net/OAuth/Token',
    // bloc's authorize endpoint isn't confirmed to support PKCE (only client_id /
    // response_type / redirect_uri are documented) — using 'state' only until that's
    // verified. Revisit if bloc turns out to support/require code_challenge.
    checks: ['state'],
    userinfo: {
      async request({ tokens }: { tokens: TokenSet }) {
        // Endpoint/base path unconfirmed beyond the method name api/account/listmypages
        // (see bloc_field_keys.json) — adjust if bloc needs additional query params.
        const res = await fetch('https://rest.bloc.net/api/account/listmypages', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const data = await res.json();
        const profiles: any[] = data.ListOfMyProfiles ?? [];
        // bloc returns every page/profile the account owns, not just the signed-in
        // person — pick the person profile (profileTypeId 0). Falls back to the first
        // entry if none is found. Unconfirmed against a real end-user login yet — the
        // only data seen so far was an admin/webmaster account with no profileTypeId 0
        // entries (see listmypages.json).
        const person = profiles.find((p) => p.profileTypeId === 0) ?? profiles[0] ?? {};
        return {
          ...person,
          success: data.success,
          code: data.code,
          message: data.message,
        };
      },
    },
    profile(profile) {
      const name = [profile.firstname, profile.lastname].filter(Boolean).join(' ') || profile.username || null;
      return {
        id: String(profile.userId),
        name,
        email: profile.email || null,
        image: profile.image || null,
        // carried through jwt/session below for order-form autofill later
        userId: profile.userId,
        mobile: profile.mobile,
        profileTypeId: profile.profileTypeId,
        hasUnpaidFees: profile.hasUnpaidFees,
        userIsMember: profile.userIsMember,
        success: profile.success,
        code: profile.code,
        message: profile.message,
      } as any;
    },
  };
}

export default defineConfig({
  providers: [
    Bloc({
      clientId: import.meta.env.OAUTH_CLIENT_ID,
      clientSecret: import.meta.env.OAUTH_CLIENT_SECRET,
    }),
  ],

  callbacks: {
    // Persist the access token + bloc profile fields into the JWT so they're
    // available on every request for the lifetime of the auth session
    // (session_variables.json — name/email travel via the standard user/token
    // fields already, so only the bloc-specific extras are added here).
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        const p = profile as unknown as BlocProfile;
        token.bloc = {
          userId: p.userId,
          mobile: p.mobile,
          profileTypeId: p.profileTypeId,
          hasUnpaidFees: p.hasUnpaidFees,
          userIsMember: p.userIsMember,
          success: p.success,
          code: p.code,
          message: p.message,
        };
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.bloc = token.bloc as typeof session.bloc;
      return session;
    },
    // TODO: once src/db/schema.ts + src/db/client.ts exist (rental_shop.md §4),
    // add a signIn callback here to upsert the user (rental_shop.md §6 "Upsert user on sign-in").
  },

  // Auth.js handles the session cookie and the /api/auth/* routes automatically
});
