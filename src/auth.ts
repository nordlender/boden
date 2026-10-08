import type { OAuthConfig, OAuthUserConfig } from '@auth/core/providers';
import type { TokenSet } from '@auth/core/types';
import { defineConfig } from 'auth-astro';
import { db } from './db/client';
import { BLOC_API_BASE_URL, BLOC_OAUTH_AUTHORIZE_URL, BLOC_OAUTH_TOKEN_URL } from './lib/bloc';
import { getBlocProfile, type BlocProfile } from './lib/blocProfile';
import { blocClientCredentials, ensureFreshBlocToken, tokenFieldsFromResponse, type BlocTokenError, type BlocTokenFields } from './lib/blocToken';
import { upsertSignedInUser } from './lib/upsertUser';

// bloc access/refresh token + expiry, JWT-only (server-side) — see
// src/lib/blocToken.ts.
declare module '@auth/core/jwt' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface JWT extends BlocTokenFields {}
}

declare module '@auth/core/types' {
  interface Session {
    // No accessToken here deliberately: `session` is what getSession()/
    // useSession() return, which is also served to client-side JS via
    // /api/auth/session. The raw bloc access/refresh tokens stay JWT-only
    // (token.accessToken / token.refreshToken) and are read server-side via
    // @auth/core/jwt's getToken() (src/lib/blocSession.ts) — never echoed to
    // the client.
    user: {
      // Auth.js's default Session.user has no `id` — expose it (from the JWT's
      // `sub`) since the role gate (src/lib/auth.ts validateSession) and the
      // users-table upsert both need a stable user id, not just email/name.
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    // Set when the bloc access token expired or failed to refresh: server-side
    // bloc calls (e.g. fee status) fail soft until the member signs in again.
    blocTokenError?: BlocTokenError;
    // bloc profile fields carried through the session for the auth session's
    // lifetime, for later order-form autofill — see session_variables.json.
    // Nested under `bloc` (rather than flattened) because Auth.js's built-in
    // AdapterSession type already declares a required `userId: string`, which
    // collides with ours if placed at the top level.
    bloc?: {
      userId: number;
      mobile: string | null;
      profileTypeId: number;
      success: boolean;
      code: number;
      message: string | null;
    };
  }
}

// Where auth-astro/Auth.js actually listens for bloc's redirect: the
// provider's callback route, fixed by the `id: 'bloc'` below — not something
// that changes per deployment. Only the app's own base URL (REDIRECT_URL)
// varies (localhost in dev, a real domain in prod); this path is joined onto
// it to build the full redirect_uri sent to bloc.
const BLOC_CALLBACK_PATH = 'api/auth/callback/bloc';

// bloc (rest.bloc.net) as OAuth2 identity provider. Not one of Auth.js's built-in
// named providers, so this is a hand-rolled generic OAuthConfig.
function Bloc(config: OAuthUserConfig<BlocProfile> & { redirectUri: string }): OAuthConfig<BlocProfile> {
  return {
    id: 'bloc',
    name: 'bloc',
    type: 'oauth',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorization: {
      url: BLOC_OAUTH_AUTHORIZE_URL,
      // bloc's authorize endpoint takes client_id, response_type,
      // redirect_uri. redirect_uri is explicit here (built from REDIRECT_URL +
      // BLOC_CALLBACK_PATH below) rather than Auth.js's auto-computed callback
      // URL, since bloc's app registration pins an exact redirect_uri value —
      // it must match this exactly, including the callback path.
      params: { response_type: 'code', redirect_uri: config.redirectUri },
    },
    token: BLOC_OAUTH_TOKEN_URL,
    // bloc's authorize endpoint isn't confirmed to support PKCE (only client_id /
    // response_type / redirect_uri are documented) — using 'state' only until that's
    // verified. Revisit if bloc turns out to support/require code_challenge.
    checks: ['state'],
    userinfo: {
      // Auth.js's assertConfig requires a `url` here even though `request` below
      // does the actual fetching — without it, every call to getSession() throws
      // InvalidEndpoints before the custom `request` ever runs (confirmed via a
      // local dev run, independent of real bloc credentials).
      url: `${BLOC_API_BASE_URL}account/listmypages`,
      async request({ tokens }: { tokens: TokenSet }) {
        // Method confirmed as account/listmypages (see bloc_field_keys.json);
        // query params beyond the bearer token are unconfirmed.
        const res = await fetch(`${BLOC_API_BASE_URL}account/listmypages`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!res.ok) {
          throw new Error(`bloc account/listmypages returned ${res.status}`);
        }
        const data = await res.json();
        const profiles: any[] = data.ListOfMyProfiles ?? [];
        // bloc returns every page/profile the account owns, not just the signed-in
        // person — pick the person profile (profileTypeId 0). Falls back to the first
        // entry if none is found. Confirmed against a real multi-profile end-user
        // login (2026-09-02) — correctly picked the profileTypeId 0 entry over an
        // org/company profile also present in the same account.
        const person = profiles.find((p) => p.profileTypeId === 0) ?? profiles[0];
        // No profile at all — fail closed rather than let profile() build a
        // user from an empty object (id: "undefined", email: null).
        if (!person) {
          throw new Error('bloc returned no profiles for this account (ListOfMyProfiles empty)');
        }
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
        // TODO: implement later — not yet consumed anywhere (see docs/rental-shop.md §6 upsert).
        userId: profile.userId,
        mobile: profile.mobile,
        profileTypeId: profile.profileTypeId,
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
      clientId: import.meta.env.BLOC_APPID,
      clientSecret: import.meta.env.OAUTH_CLIENT_SECRET,
      // REDIRECT_URL is just the app's own base (e.g. http://172.17.0.2:4321/) —
      // swap it per environment without touching the fixed callback path.
      redirectUri: new URL(BLOC_CALLBACK_PATH, import.meta.env.REDIRECT_URL).toString(),
    }),
  ],

  callbacks: {
    // Upsert into `users` on every sign-in (docs/rental-shop.md §6) — this is what
    // gives orders.userId a real row to reference once an order is placed.
    // Runs before jwt()/session(), keyed on bloc's own numeric userId rather
    // than `user.id` — Auth.js's oauth callback handler (getUserAndAccount in
    // @auth/core) always overwrites the id our profile() sets with a fresh
    // crypto.randomUUID() (it reserves `user.id` for an adapter-assigned
    // identity and carries the provider's own id separately as
    // account.providerAccountId), so `user.id` here is never bloc's userId.
    // `profile` is the raw bloc userinfo response (unaffected by that
    // override), so read userId from there instead — see #59.
    // Fails closed (returns false -> sign-in rejected) rather than letting a
    // signed-in session exist with no matching users row.
    async signIn({ user, profile }) {
      const blocUserId = getBlocProfile(profile)?.userId;
      if (!blocUserId || !user.email) return false;
      await upsertSignedInUser(db, { id: String(blocUserId), email: user.email, name: user.name });
      return true;
    },
    // Persist the access token + bloc profile fields into the JWT so they're
    // available on every request for the lifetime of the auth session
    // (session_variables.json — name/email travel via the standard user/token
    // fields already, so only the bloc-specific extras are added here).
    //
    // Sign-in (`account` present) also stores the bloc refresh token and
    // expiry when bloc returned them; every later call (each
    // /api/auth/session hit, getSession(), and src/lib/blocSession.ts)
    // refreshes the access token when it's near expiry, or marks it
    // `blocTokenError` when it can't — see src/lib/blocToken.ts (#319).
    // The tokens stay JWT-only; session() below never copies them.
    async jwt({ token, account, profile }) {
      if (!account) {
        return ensureFreshBlocToken(token, blocClientCredentials());
      }
      if (account.access_token) {
        Object.assign(token, tokenFieldsFromResponse(account));
      }
      const p = getBlocProfile(profile);
      if (p) {
        token.bloc = {
          userId: p.userId,
          mobile: p.mobile,
          profileTypeId: p.profileTypeId,
          success: p.success,
          code: p.code,
          message: p.message,
        };
        // On initial sign-in, Auth.js pre-seeds token.sub from `user.id` —
        // which is its own generated UUID, not the profile id our profile()
        // set (see the signIn callback above for why). Overwrite it here
        // with bloc's actual userId so token.sub / session.user.id / users.id
        // all agree (#59).
        token.sub = String(p.userId);
      }
      return token;
    },
    async session({ session, token }) {
      session.bloc = token.bloc as typeof session.bloc;
      // Only *why* bloc access is gone (never the tokens), so the UI can
      // prompt a fresh sign-in.
      if (token.blocTokenError) session.blocTokenError = token.blocTokenError;
      // token.sub is set from the profile's `id` on sign-in — expose it so
      // consumers (role gate, users-table upsert) have a stable user id.
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },

  // Auth.js handles the session cookie and the /api/auth/* routes automatically
});
