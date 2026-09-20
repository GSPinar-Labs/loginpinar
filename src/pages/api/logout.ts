import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
    },
  });
};
