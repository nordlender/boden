// Shape of bloc's raw OAuth userinfo response (rest.bloc.net account/listmypages),
// as returned by the `profile()` callback's input in src/auth.ts's Bloc provider.
export interface BlocProfile {
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

// Auth.js's oauth callback handler (getUserAndAccount in @auth/core) always
// overwrites the id our provider's profile() sets with a fresh
// crypto.randomUUID() (it reserves `user.id` for an adapter-assigned identity
// and carries the provider's own id separately as account.providerAccountId),
// so `user.id` / the shaped `profile` object passed around by Auth.js never
// carries bloc's real userId. The raw OAuth `profile` object passed into the
// signIn/jwt callbacks is unaffected by that override, so callers read bloc's
// fields from there instead — via this cast — rather than duplicating it
// inline in each callback (see #59).
export function getBlocProfile(profile: unknown): BlocProfile | undefined {
  return profile as BlocProfile | undefined;
}
