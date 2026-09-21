// CLI para el Azure Container Apps Job programado.
// Dispara el informe semanal llamando al endpoint interno /api/admin/weekly-report,
// que reúne los logs de la semana, envía el email y los borra.

const base = process.env.APP_URL || 'https://login.gspinar.com';
const secret = process.env.CRON_SECRET || '';

try {
  const res = await fetch(`${base}/api/admin/weekly-report`, {
    method: 'POST',
    headers: { 'X-Cron-Secret': secret },
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[weekly-report] ${res.status} ${JSON.stringify(data)}`);
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error('[weekly-report]', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
