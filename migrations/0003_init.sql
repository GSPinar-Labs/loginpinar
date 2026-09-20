-- Migration 0003: OIDC clients table + settings table
CREATE TABLE IF NOT EXISTS oidc_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clientId TEXT NOT NULL UNIQUE,
  clientSecret TEXT NOT NULL,
  redirectUris TEXT NOT NULL, -- JSON array
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Seed default Google Workspace client
INSERT OR IGNORE INTO oidc_clients (clientId, clientSecret, redirectUris, name, description, logo, enabled, createdAt, updatedAt)
VALUES (
  'google-workspace',
  '',
  '[]',
  'Google Workspace',
  'Correo, Drive, Calendar y más de Google',
  '',
  1,
  datetime('now'),
  datetime('now')
);

CREATE INDEX IF NOT EXISTS idx_oidc_clients_clientId ON oidc_clients(clientId);
