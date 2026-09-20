import type { APIRoute } from 'astro';
import { getOidcPublicJWK } from '../../../lib/jwt';

export const GET: APIRoute = async () => {
  const jwk = getOidcPublicJWK();
  return new Response(JSON.stringify({
    keys: [jwk],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
