-- Members table
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  personalEmail TEXT NOT NULL UNIQUE,
  institutionalEmails TEXT NOT NULL, -- JSON array
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- Verification codes (OTP)
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personalEmail TEXT NOT NULL,
  institutionalEmail TEXT NOT NULL,
  code TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

-- OIDC authorization codes
CREATE TABLE IF NOT EXISTS authorization_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  personalEmail TEXT NOT NULL,
  institutionalEmail TEXT NOT NULL,
  name TEXT NOT NULL,
  redirectUri TEXT NOT NULL,
  clientId TEXT NOT NULL,
  nonce TEXT,
  expiresAt TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

-- Audit logs (weekly rotation)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT,
  details TEXT, -- JSON
  weekKey TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_members_personalEmail ON members(personalEmail);
CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup ON verification_codes(personalEmail, institutionalEmail, used);
CREATE INDEX IF NOT EXISTS idx_authorization_codes_code ON authorization_codes(code);
CREATE INDEX IF NOT EXISTS idx_audit_logs_weekKey ON audit_logs(weekKey);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target);
