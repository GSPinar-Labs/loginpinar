import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/d1';
import { requireAdmin } from '../../../lib/admin-auth';
import { getCurrentWeekLogs, getAllWeekKeys } from '../../../lib/audit';

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = await getDB();
    const url = new URL(context.request.url);
    const actor = url.searchParams.get('actor') || undefined;
    const target = url.searchParams.get('target') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '1000', 10);
    const showArchived = url.searchParams.get('archived') === 'true';

    if (showArchived) {
      const weekKeys = await getAllWeekKeys(db);
      return new Response(JSON.stringify({ weekKeys }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const logs = await getCurrentWeekLogs(db, { actor, target, action, limit });

    return new Response(JSON.stringify({ logs, total: logs.length, week: 'current' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin logs error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
