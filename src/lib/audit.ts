import { getDB, type D1Database } from './d1';

export interface AuditLog {
  id?: number;
  action: 'login_success' | 'login_fail' | 'otp_sent' | 'oidc_authorize' | 'admin_login' | 'member_create' | 'member_update' | 'member_delete';
  actor: string;
  target?: string;
  details?: Record<string, unknown>;
  weekKey: string;
  timestamp: string;
}

export function getCurrentWeekKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7);
  return `${year}-W${weekNo}`;
}

export async function logAudit(db: D1Database, data: Omit<AuditLog, 'id' | 'timestamp' | 'weekKey'>): Promise<void> {
  await db.prepare(
    'INSERT INTO audit_logs (action, actor, target, details, weekKey, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    data.action,
    data.actor.toLowerCase().trim(),
    data.target || null,
    data.details ? JSON.stringify(data.details) : null,
    getCurrentWeekKey(),
    new Date().toISOString()
  ).run();
}

export async function getCurrentWeekLogs(db: D1Database, options?: {
  actor?: string;
  target?: string;
  action?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const conditions = ['weekKey = ?'];
  const values: unknown[] = [getCurrentWeekKey()];

  if (options?.actor) { conditions.push('actor = ?'); values.push(options.actor.toLowerCase().trim()); }
  if (options?.target) { conditions.push('target = ?'); values.push(options.target.toLowerCase().trim()); }
  if (options?.action) { conditions.push('action = ?'); values.push(options.action); }

  const sql = `SELECT * FROM audit_logs WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC LIMIT ?`;
  values.push(options?.limit || 1000);

  const res = await db.prepare(sql).bind(...values).all<Record<string, unknown>>();
  return res.results.map(row => ({
    id: row.id as number,
    action: row.action as string,
    actor: row.actor as string,
    target: row.target as string | undefined,
    details: row.details ? JSON.parse(row.details as string) : undefined,
    weekKey: row.weekKey as string,
    timestamp: row.timestamp as string,
  }));
}

export async function getLogsByWeekKey(db: D1Database, weekKey: string): Promise<AuditLog[]> {
  const res = await db.prepare('SELECT * FROM audit_logs WHERE weekKey = ? ORDER BY timestamp DESC').bind(weekKey).all<Record<string, unknown>>();
  return res.results.map(row => ({
    id: row.id as number,
    action: row.action as string,
    actor: row.actor as string,
    target: row.target as string | undefined,
    details: row.details ? JSON.parse(row.details as string) : undefined,
    weekKey: row.weekKey as string,
    timestamp: row.timestamp as string,
  }));
}

export async function deleteLogsByWeekKey(db: D1Database, weekKey: string): Promise<void> {
  await db.prepare('DELETE FROM audit_logs WHERE weekKey = ?').bind(weekKey).run();
}

export async function getAllWeekKeys(db: D1Database): Promise<string[]> {
  const res = await db.prepare('SELECT DISTINCT weekKey FROM audit_logs ORDER BY weekKey DESC').all<Record<string, unknown>>();
  return res.results.map(r => r.weekKey as string);
}
