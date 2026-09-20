-- Migration 0004: store PKCE challenge sent by Google Workspace OIDC.
ALTER TABLE authorization_codes ADD COLUMN codeChallenge TEXT;
