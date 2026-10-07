import { describe, expect, it } from 'vitest';
import { BLOC_API_BASE_URL, BLOC_OAUTH_AUTHORIZE_URL, BLOC_OAUTH_TOKEN_URL, BLOC_ORIGIN } from '../bloc';

describe('bloc URLs', () => {
  it('derives the host-only origin and OAuth endpoints from the API base URL', () => {
    expect(BLOC_API_BASE_URL).toBe('https://rest.bloc.net/api/');
    expect(BLOC_ORIGIN).toBe('https://rest.bloc.net');
    expect(BLOC_OAUTH_AUTHORIZE_URL).toBe('https://rest.bloc.net/OAuth/Authorize');
    expect(BLOC_OAUTH_TOKEN_URL).toBe('https://rest.bloc.net/OAuth/Token');
  });
});
