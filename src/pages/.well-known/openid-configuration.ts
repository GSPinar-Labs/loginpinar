import type { APIRoute } from 'astro';
import { ENV } from '../../lib/env';

export const GET: APIRoute = async () => {
  const config = {
    issuer: ENV.OIDC_ISSUER,
    authorization_endpoint: `${ENV.APP_URL}/api/oidc/authorize`,
    token_endpoint: `${ENV.APP_URL}/api/oidc/token`,
    userinfo_endpoint: `${ENV.APP_URL}/api/oidc/userinfo`,
    end_session_endpoint: `${ENV.APP_URL}/logout`,
    jwks_uri: `${ENV.APP_URL}/api/oidc/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'email', 'name', 'picture', 'email_verified'],
  };

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
