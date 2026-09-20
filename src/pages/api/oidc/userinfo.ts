import type { APIRoute } from 'astro';
import { verifyAccessToken } from '../../../lib/jwt';

export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') || '';

    if (!token) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await verifyAccessToken(token);

    return new Response(JSON.stringify({
      sub: payload.sub,
      email: payload.sub,
      email_verified: true,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
