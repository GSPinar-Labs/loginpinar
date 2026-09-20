import type { APIRoute } from 'astro';
import { getDB } from '../../lib/d1';
import { findMembersByInstitutionalEmail, createVerificationCode } from '../../lib/members';
import { sendVerificationEmail } from '../../lib/email';
import { logAudit } from '../../lib/audit';

function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String((buf[0] % 900000) + 100000).padStart(6, '0');
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const db = await getDB();
    const body = await request.json();
    const { institutionalEmail, personalEmail } = body;

    if (!institutionalEmail || !personalEmail) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (typeof personalEmail !== 'string' || personalEmail.length > 320 || !personalEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email personal no válido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (typeof institutionalEmail !== 'string' || institutionalEmail.length > 320 || !institutionalEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email institucional no válido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanInstitutional = institutionalEmail.toLowerCase().trim();
    const cleanPersonal = personalEmail.toLowerCase().trim();

    const recentSends = await db.prepare(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE action = 'otp_sent' AND actor = ? AND target = ?
       AND timestamp > strftime('%Y-%m-%dT%H:%M:%S', 'now', '-15 minutes')`
    ).bind(cleanPersonal, cleanInstitutional).first<Record<string, unknown>>();

    if (recentSends && (recentSends.count as number) >= 20) {
      return new Response(JSON.stringify({ error: 'Demasiados envíos de código. Espera 15 minutos.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const members = await findMembersByInstitutionalEmail(db, cleanInstitutional);
    const member = members.find(m => m.personalEmail === cleanPersonal);

    if (!member) {
      await logAudit(db, {
        action: 'login_fail',
        actor: cleanPersonal,
        target: cleanInstitutional,
        details: { reason: 'correo personal no asociado' },
      });
      return new Response(JSON.stringify({ error: 'El correo personal no está asociado a esta cuenta institucional' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const code = generateCode();
    await createVerificationCode(db, {
      personalEmail: cleanPersonal,
      institutionalEmail: cleanInstitutional,
      code,
    });

    await sendVerificationEmail(cleanPersonal, code, cleanInstitutional);

    await logAudit(db, {
      action: 'otp_sent',
      actor: cleanPersonal,
      target: cleanInstitutional,
      details: { memberName: member.name },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('verify-email error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
