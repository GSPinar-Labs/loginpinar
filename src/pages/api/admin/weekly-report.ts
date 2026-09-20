import type { APIRoute } from 'astro';
import { ENV } from '../../../lib/env';
import { getDB } from '../../../lib/d1';
import { requireAdmin } from '../../../lib/admin-auth';
import { getLogsByWeekKey, deleteLogsByWeekKey, getCurrentWeekKey } from '../../../lib/audit';
import { sendWeeklyReport } from '../../../lib/email';

export const POST: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  const cronSecret = context.request.headers.get('X-Cron-Secret');
  const isCron = ENV.CRON_SECRET && cronSecret && cronSecret === ENV.CRON_SECRET;

  if (!admin && !isCron) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = await getDB();
    const url = new URL(context.request.url);
    const weekKey = url.searchParams.get('week') || getCurrentWeekKey();

    const logs = await getLogsByWeekKey(db, weekKey);

    await sendWeeklyReport(ENV.ADMIN_EMAIL, weekKey, logs);

    await deleteLogsByWeekKey(db, weekKey);

    return new Response(JSON.stringify({
      success: true,
      weekKey,
      sent: logs.length,
      message: `Informe enviado a ${ENV.ADMIN_EMAIL} y ${logs.length} logs eliminados.`,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('weekly-report error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error generando informe' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
