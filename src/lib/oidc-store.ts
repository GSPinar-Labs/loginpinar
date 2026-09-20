import { getDB, type D1Database } from './d1';

interface AuthorizationCode {
  id?: number;
  code: string;
  personalEmail: string;
  institutionalEmail: string;
  name: string;
  redirectUri: string;
  clientId: string;
  nonce?: string;
  codeChallenge?: string;
  expiresAt: string;
  used: boolean;
}

export async function createAuthorizationCode(db: D1Database, data: {
  code: string;
  personalEmail: string;
  institutionalEmail: string;
  name: string;
  redirectUri: string;
  clientId: string;
  nonce?: string;
  codeChallenge?: string;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO authorization_codes (code, personalEmail, institutionalEmail, name, redirectUri, clientId, nonce, codeChallenge, expiresAt, used, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'
  ).bind(
    data.code,
    data.personalEmail,
    data.institutionalEmail,
    data.name,
    data.redirectUri,
    data.clientId,
    data.nonce || null,
    data.codeChallenge || null,
    expiresAt,
    new Date().toISOString()
  ).run();
}

export async function consumeAuthorizationCode(
  db: D1Database,
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<AuthorizationCode | null> {
  const row = await db.prepare(
    'SELECT * FROM authorization_codes WHERE code = ? AND clientId = ? AND redirectUri = ? AND used = 0'
  ).bind(code, clientId, redirectUri).first<Record<string, unknown>>();

  if (!row) return null;

  const now = new Date();
  const expires = new Date(row.expiresAt as string);
  if (now > expires) return null;

  // PKCE verification
  const storedChallenge = row.codeChallenge as string | null;
  if (storedChallenge && codeVerifier) {
    const encoder = new TextEncoder();
    const verifierBytes = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', verifierBytes);
    const hashArray = new Uint8Array(hashBuffer);
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    const computedChallenge = hashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (computedChallenge !== storedChallenge) {
      return null;
    }
  } else if (storedChallenge && !codeVerifier) {
    return null;
  }

  await db.prepare('UPDATE authorization_codes SET used = 1 WHERE id = ?').bind(row.id).run();

  return {
    id: row.id as number,
    code: row.code as string,
    personalEmail: row.personalEmail as string,
    institutionalEmail: row.institutionalEmail as string,
    name: row.name as string,
    redirectUri: row.redirectUri as string,
    clientId: row.clientId as string,
    nonce: row.nonce as string | undefined,
    codeChallenge: storedChallenge || undefined,
    expiresAt: row.expiresAt as string,
    used: true,
  };
}
