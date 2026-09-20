import type { APIRoute } from 'astro';
import { getDB } from '../../lib/d1';
import { verifySessionToken } from '../../lib/jwt';
import { findMemberByPersonalEmail, isAdmin } from '../../lib/members';

export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') || '';

    if (!token) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = await verifySessionToken(token);
    const db = await getDB();
    const member = await findMemberByPersonalEmail(db, payload.personalEmail);
    const admin = member ? isAdmin(member) : false;

    return new Response(JSON.stringify({
      authenticated: true,
      name: payload.name,
      personalEmail: payload.personalEmail,
      institutionalEmails: payload.institutionalEmails,
      admin,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
