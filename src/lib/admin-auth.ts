import type { APIContext } from 'astro';
import { verifySessionToken } from './jwt';
import { findMemberByPersonalEmail, isAdmin } from './members';
import { getDB } from './d1';

export async function requireAdmin(context: APIContext): Promise<{ personalEmail: string; name: string } | null> {
  const authHeader = context.request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';

  let payload: Awaited<ReturnType<typeof verifySessionToken>> | null = null;

  if (token) {
    try {
      payload = await verifySessionToken(token);
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    const cookieHeader = context.request.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/session_token=([^;]+)/);
    const cookieToken = sessionMatch ? sessionMatch[1] : '';
    if (cookieToken) {
      try {
        payload = await verifySessionToken(cookieToken);
      } catch {
        // ignore
      }
    }
  }

  if (!payload) return null;

  try {
    const db = await getDB();
    const member = await findMemberByPersonalEmail(db, payload.personalEmail);
    if (member && isAdmin(member)) {
      return { personalEmail: member.personalEmail, name: member.name };
    }
  } catch {
    return null;
  }

  return null;
}
