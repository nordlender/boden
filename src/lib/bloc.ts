// Single source for bloc's (rest.bloc.net) URLs — see #318.
//
// BLOC_API_BASE_URL is the base for every bloc REST API method: append the
// method path (e.g. `account/listmypages`) to build a full endpoint URL.
// Everything else is derived from it so the host only lives here.
export const BLOC_API_BASE_URL = 'https://rest.bloc.net/api/';

// Host only (no trailing slash, no `api/`), for callers that already hold a
// full `/api/...` path — e.g. src/lib/blocDebug.ts.
export const BLOC_ORIGIN = new URL(BLOC_API_BASE_URL).origin;

// bloc's OAuth2 endpoints (outside `api/`), used by src/auth.ts's provider
// config and src/lib/blocToken.ts's refresh grant.
export const BLOC_OAUTH_AUTHORIZE_URL = `${BLOC_ORIGIN}/OAuth/Authorize`;
export const BLOC_OAUTH_TOKEN_URL = `${BLOC_ORIGIN}/OAuth/Token`;
