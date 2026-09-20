import { ENV } from './env';

export interface OIDCClient {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  name: string;
  logo?: string;
  description?: string;
  // Campos de BD (para admin panel)
  id?: number;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// === Clientes hardcodeados (flujo OIDC legacy) ===
export const OIDC_CLIENTS: OIDCClient[] = [
  {
    clientId: 'google-workspace',
    clientSecret: ENV.OIDC_CLIENT_SECRET,
    redirectUris: [
      ENV.GOOGLE_REDIRECT_URI,
      'https://accounts.google.com/o/oauth2/token',
      'https://accounts.google.com/o/oauth2/auth',
    ],
    name: 'Google Workspace',
    logo: '/img/google-workspace.svg',
    description: 'Correo, Drive, Calendar y más de Google',
  },
];

export function getClientById(clientId: string): OIDCClient | undefined;
export async function getClientById(db: any, clientId: string): Promise<OIDCClient | undefined>;
export function getClientById(arg1: any, arg2?: string): OIDCClient | undefined | Promise<OIDCClient | undefined> {
  if (arg2 !== undefined) {
    // Modo async con DB: usar para admin panel y clientes custom
    return getClientByIdFromDB(arg1, arg2);
  }
  // Modo sync legacy: busca en array hardcodeado
  return OIDC_CLIENTS.find(c => c.clientId === arg1);
}

async function getClientByIdFromDB(db: any, clientId: string): Promise<OIDCClient | undefined> {
  if (clientId === 'google-workspace') {
    return OIDC_CLIENTS.find(c => c.clientId === clientId);
  }
  try {
    const row = await db.prepare("SELECT * FROM oidc_clients WHERE clientId = ? AND enabled = 1").bind(clientId).first();
    return row ? rowToClient(row) : undefined;
  } catch { return undefined; }
}

export function validateRedirectUri(client: OIDCClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

// === Funciones de BD para admin panel ===
import type { D1Database } from './d1';

export async function getAllClients(db: D1Database): Promise<OIDCClient[]> {
  const builtin = OIDC_CLIENTS.map(c => ({ ...c, enabled: true }));
  try {
    const res = await db.prepare("SELECT * FROM oidc_clients WHERE clientId != 'google-workspace' ORDER BY name ASC").all<Record<string, unknown>>();
    return builtin.concat(res.results.map(rowToClient));
  } catch { return builtin; }
}

export async function createClient(db: D1Database, data: Partial<OIDCClient>): Promise<number> {
  const now = new Date().toISOString();
  const res = await db.prepare(
    "INSERT INTO oidc_clients (clientId, clientSecret, redirectUris, name, description, logo, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    data.clientId || '',
    data.clientSecret || '',
    JSON.stringify(data.redirectUris || []),
    data.name || '',
    data.description || '',
    data.logo || '',
    data.enabled !== false ? 1 : 0,
    now, now
  ).run();
  return res.meta.last_row_id;
}

export async function updateClient(db: D1Database, id: number, data: Partial<OIDCClient>): Promise<void> {
  const fields: string[] = []; const values: unknown[] = [];
  if (data.clientId !== undefined) { fields.push("clientId = ?"); values.push(data.clientId); }
  if (data.clientSecret !== undefined) { fields.push("clientSecret = ?"); values.push(data.clientSecret); }
  if (data.redirectUris !== undefined) { fields.push("redirectUris = ?"); values.push(JSON.stringify(data.redirectUris)); }
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.logo !== undefined) { fields.push("logo = ?"); values.push(data.logo); }
  if (data.enabled !== undefined) { fields.push("enabled = ?"); values.push(data.enabled ? 1 : 0); }
  if (!fields.length) return;
  fields.push("updatedAt = ?"); values.push(new Date().toISOString()); values.push(id);
  await db.prepare(`UPDATE oidc_clients SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
}

export async function deleteClient(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM oidc_clients WHERE id = ? AND clientId != 'google-workspace'").bind(id).run();
}

function rowToClient(row: Record<string, unknown>): OIDCClient {
  let redirectUris: string[] = [];
  try { redirectUris = JSON.parse(row.redirectUris as string); } catch {};
  return {
    id: row.id as number,
    clientId: row.clientId as string,
    clientSecret: row.clientSecret as string,
    redirectUris,
    name: row.name as string,
    description: row.description as string || '',
    logo: row.logo as string || '',
    enabled: (row.enabled as number) === 1,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}
