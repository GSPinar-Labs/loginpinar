import { createClient, type Client, type InValue } from '@libsql/client';
import { ENV } from './env';

// Interfaz compatible con Cloudflare D1 para no tocar el resto del código.
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta: { last_row_id: number; changes: number } }>;
}

function toInValue(value: unknown): InValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value as InValue;
}

class LibSqlPreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly client: Client,
    private readonly sql: string,
    private readonly args: InValue[] = []
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new LibSqlPreparedStatement(this.client, this.sql, values.map(toInValue));
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return (result.rows[0] as unknown as T) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return { results: result.rows as unknown as T[], success: true };
  }

  async run(): Promise<{ success: boolean; meta: { last_row_id: number; changes: number } }> {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return {
      success: true,
      meta: {
        last_row_id: Number(result.lastInsertRowid ?? 0),
        changes: result.rowsAffected,
      },
    };
  }
}

class LibSqlDatabase implements D1Database {
  constructor(private readonly client: Client) {}

  prepare(query: string): D1PreparedStatement {
    return new LibSqlPreparedStatement(this.client, query);
  }
}

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const url = ENV.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error('TURSO_DATABASE_URL no configurada.');
    }
    _client = createClient({ url, authToken: ENV.TURSO_AUTH_TOKEN || undefined });
  }
  return _client;
}

export function getDB(): D1Database {
  return new LibSqlDatabase(getClient());
}
