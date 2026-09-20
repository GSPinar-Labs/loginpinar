import type { APIRoute } from 'astro';
import { getDB } from '../../lib/d1';
import { verifyCode, findMemberByPersonalEmail, isAdmin } from '../../lib/members';
import { createSessionToken } from '../../lib/jwt';
import { logAudit } from '../../lib/audit';
import { ENV } from '../../lib/env';

export const POST: APIRoute = async ({ request }) => {
  try {
    const db = await getDB();
    const body = await request.json();
    const { institutionalEmail, personalEmail, code } = body;

    if (!institutionalEmail || !personalEmail || !code) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!/^\d{6}$/.test(code)) {
      return new Response(JSON.stringify({ error: 'Código no válido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanInstitutional = institutionalEmail.toLowerCase().trim();
    const cleanPersonal = personalEmail.toLowerCase().trim();

    const recentFails = await db.prepare(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE action = 'login_fail' AND actor = ? AND target = ?
       AND details LIKE '%código%'
        AND timestamp > strftime('%Y-%m-%dT%H:%M:%S', 'now', '-15 minutes')`
    ).bind(cleanPersonal, cleanInstitutional).first<Record<string, unknown>>();

    if (recentFails && (recentFails.count as number) >= ENV.MAX_OTP_ATTEMPTS) {
      return new Response(JSON.stringify({ error: 'Demasiados intentos de código. Espera 15 minutos.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const valid = await verifyCode(db, cleanPersonal, cleanInstitutional, code);

    if (!valid) {
      await logAudit(db, {
        action: 'login_fail',
        actor: cleanPersonal,
        target: cleanInstitutional,
        details: { reason: 'código inválido o expirado' },
      });
      return new Response(JSON.stringify({ error: 'Código inválido o expirado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const member = await findMemberByPersonalEmail(db, cleanPersonal);

    if (!member) {
      return new Response(JSON.stringify({ error: 'Miembro no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = await createSessionToken({
      personalEmail: member.personalEmail,
      institutionalEmails: member.institutionalEmails,
      name: member.name,
      admin: isAdmin(member),
    });

    await logAudit(db, {
      action: 'login_success',
      actor: member.personalEmail,
      target: cleanInstitutional,
      details: { name: member.name, admin: isAdmin(member) },
    });

    const cookieStr = `session_token=${token}; Path=/; Max-Age=${15 * 24 * 60 * 60}; HttpOnly; SameSite=Lax; Secure`;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieStr,
      },
    });
  } catch (error) {
    console.error('verify-code error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
