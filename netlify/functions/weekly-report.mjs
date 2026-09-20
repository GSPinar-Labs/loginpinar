// Netlify Scheduled Function — Informe semanal de auditoría.
//
// Se ejecuta cada sábado a las 19:00 UTC (configurado en netlify.toml) y llama
// al endpoint interno /api/admin/weekly-report, que reúne los logs de la semana,
// envía el informe por email a ADMIN_EMAIL y borra esos logs.
//
// El endpoint está protegido con la cabecera X-Cron-Secret (CRON_SECRET).

export default async () => {
  const base = process.env.APP_URL || 'https://login.gspinar.com';
  const secret = process.env.CRON_SECRET || '';

  try {
    const res = await fetch(`${base}/api/admin/weekly-report`, {
      method: 'POST',
      headers: { 'X-Cron-Secret': secret },
    });
    const data = await res.json().catch(() => ({}));
    console.log('[weekly-report] status', res.status, JSON.stringify(data));
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[weekly-report] error', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
