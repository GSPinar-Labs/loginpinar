import { getDB, type D1Database } from './d1';
import { ENV } from './env';

export interface Member {
  id?: number;
  name: string;
  personalEmail: string;
  institutionalEmails: string[];
  force_logout_after?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VerificationCode {
  id?: number;
  personalEmail: string;
  institutionalEmail: string;
  code: string;
  expiresAt: string;
  used: boolean;
  createdAt?: string;
}

export function isAdmin(member: Member): boolean {
  return member.institutionalEmails.includes(ENV.ADMIN_EMAIL);
}

export async function getAdminCount(db: D1Database): Promise<number> {
  const pattern = `%${ENV.ADMIN_EMAIL.toLowerCase().trim()}%`;
  const res = await db.prepare(
    "SELECT COUNT(*) as count FROM members WHERE institutionalEmails LIKE ?"
  ).bind(pattern).first<Record<string, unknown>>();
  return (res?.count as number) || 0;
}

function parseInstitutionalEmails(value: string | unknown): string[] {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return [value]; }
  }
  return [];
}

function rowToMember(row: Record<string, unknown>): Member {
  return {
    id: row.id as number,
    name: row.name as string,
    personalEmail: row.personalEmail as string,
    institutionalEmails: parseInstitutionalEmails(row.institutionalEmails),
    force_logout_after: row.force_logout_after as string | null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

export async function findMemberByPersonalEmail(db: D1Database, email: string): Promise<Member | null> {
  const row = await db.prepare('SELECT * FROM members WHERE personalEmail = ?').bind(email.toLowerCase().trim()).first();
  return row ? rowToMember(row) : null;
}

export async function findMembersByInstitutionalEmail(db: D1Database, email: string): Promise<Member[]> {
  const pattern = `%${email.toLowerCase().trim()}%`;
  const res = await db.prepare('SELECT * FROM members WHERE institutionalEmails LIKE ?').bind(pattern).all<Record<string, unknown>>();
  return res.results.map(rowToMember);
}

export async function getAllMembers(db: D1Database): Promise<Member[]> {
  const res = await db.prepare('SELECT * FROM members ORDER BY name ASC').all<Record<string, unknown>>();
  return res.results.map(rowToMember);
}

export async function getMemberById(db: D1Database, id: number): Promise<Member | null> {
  const row = await db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return row ? rowToMember(row) : null;
}

export async function createMember(db: D1Database, data: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const now = new Date().toISOString();
  const res = await db.prepare(
    'INSERT INTO members (name, personalEmail, institutionalEmails, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    data.name,
    data.personalEmail.toLowerCase().trim(),
    JSON.stringify(data.institutionalEmails.map(e => e.toLowerCase().trim())),
    now,
    now
  ).run();
  return res.meta.last_row_id;
}

export async function updateMember(db: D1Database, id: number, data: Partial<Omit<Member, 'id' | 'createdAt'>>): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.personalEmail !== undefined) { fields.push('personalEmail = ?'); values.push(data.personalEmail.toLowerCase().trim()); }
  if (data.institutionalEmails !== undefined) { fields.push('institutionalEmails = ?'); values.push(JSON.stringify(data.institutionalEmails.map(e => e.toLowerCase().trim()))); }

  const now = new Date().toISOString();
  // Cualquier edición cierra la sesión activa del miembro, para que los cambios se apliquen al instante.
  fields.push('force_logout_after = ?');
  values.push(now);
  fields.push('updatedAt = ?');
  values.push(now);
  values.push(id);

  await db.prepare(`UPDATE members SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteMember(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
}

export async function forceLogoutMember(db: D1Database, id: number): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare('UPDATE members SET force_logout_after = ? WHERE id = ?').bind(now, id).run();
}

export async function isSessionValid(db: D1Database, personalEmail: string, sessionIat: number): Promise<boolean> {
  const member = await findMemberByPersonalEmail(db, personalEmail);
  if (!member || !member.force_logout_after) return true;
  const forceLogoutTime = new Date(member.force_logout_after).getTime() / 1000;
  return sessionIat >= forceLogoutTime;
}

export async function createVerificationCode(db: D1Database, data: {
  personalEmail: string;
  institutionalEmail: string;
  code: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  await db.prepare(
    'UPDATE verification_codes SET used = 1 WHERE personalEmail = ? AND institutionalEmail = ? AND used = 0'
  ).bind(data.personalEmail.toLowerCase().trim(), data.institutionalEmail.toLowerCase().trim()).run();

  await db.prepare(
    'INSERT INTO verification_codes (personalEmail, institutionalEmail, code, expiresAt, used, createdAt) VALUES (?, ?, ?, ?, 0, ?)'
  ).bind(
    data.personalEmail.toLowerCase().trim(),
    data.institutionalEmail.toLowerCase().trim(),
    data.code,
    expiresAt,
    now
  ).run();
}

export async function verifyCode(
  db: D1Database,
  personalEmail: string,
  institutionalEmail: string,
  code: string
): Promise<boolean> {
  const row = await db.prepare(
    'SELECT * FROM verification_codes WHERE personalEmail = ? AND institutionalEmail = ? AND code = ? AND used = 0'
  ).bind(personalEmail.toLowerCase().trim(), institutionalEmail.toLowerCase().trim(), code.trim()).first<Record<string, unknown>>();

  if (!row) return false;

  const now = new Date();
  const expires = new Date(row.expiresAt as string);
  if (now > expires) return false;

  await db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').bind(row.id).run();
  return true;
}
