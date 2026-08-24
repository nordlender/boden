import GitHub from '@auth/core/providers/github'; // swap for any provider
import { defineConfig } from 'auth-astro';

declare module '@auth/core/types' {
  interface Session {
    accessToken?: string;
  }
}

export default defineConfig({
  providers: [
    GitHub({
      clientId: import.meta.env.OAUTH_CLIENT_ID,
      clientSecret: import.meta.env.OAUTH_CLIENT_SECRET,
    }),
  ],

  callbacks: {
    // Persist the access token into the JWT so it's available on every request
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      return session;
    },
    // TODO: once src/db/schema.ts + src/db/client.ts exist (rental_shop.md §4),
    // add a signIn callback here to upsert the user (rental_shop.md §6 "Upsert user on sign-in").
  },

  // Auth.js handles the session cookie and the /api/auth/* routes automatically
});
