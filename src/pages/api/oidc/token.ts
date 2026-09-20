import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/d1';
import { createIdToken, createAccessToken } from '../../../lib/jwt';
import { consumeAuthorizationCode } from '../../../lib/oidc-store';
import { getClientById } from '../../../lib/clients';
import { logAudit } from '../../../lib/audit';

function getBasicClientCredentials(request: Request): { clientId: string; clientSecret: string } | null {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return null;

  try {
    const decoded = atob(auth.slice('Basic '.length));
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;
    return {
      clientId: decoded.slice(0, separator),
      clientSecret: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const db = getDB();
  try {
    const body = await request.formData();
    const basicCredentials = getBasicClientCredentials(request);
    const grantType = body.get('grant_type') as string;
    const code = body.get('code') as string;
    const redirectUri = body.get('redirect_uri') as string;
    const clientId = (body.get('client_id') as string) || basicCredentials?.clientId || '';
    const clientSecret = (body.get('client_secret') as string) || basicCredentials?.clientSecret || '';
    const codeVerifier = body.get('code_verifier') as string || '';
    console.log('OIDC TOKEN request:', JSON.stringify({ grantType, code: code?.substring(0,12), redirectUri, clientId, hasVerifier: !!codeVerifier }));

    if (grantType !== 'authorization_code') {
      return new Response(JSON.stringify({ error: 'unsupported_grant_type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!code || !redirectUri || !clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const client = await getClientById(db, clientId);
    if (!client || client.clientSecret !== clientSecret) {
      console.log('OIDC TOKEN invalid_client: secret mismatch');
      return new Response(JSON.stringify({ error: 'invalid_client' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const recentTokens = await db.prepare(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE action = 'oidc_token' AND target = ?
       AND timestamp > strftime('%Y-%m-%dT%H:%M:%S', 'now', '-15 minutes')`
    ).bind(clientId).first<Record<string, unknown>>();
    if (recentTokens && (recentTokens.count as number) >= 30) {
      return new Response(JSON.stringify({ error: 'too_many_requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const authCode = await consumeAuthorizationCode(db, code, clientId, redirectUri, codeVerifier || undefined);

    if (!authCode) {
      console.log('OIDC TOKEN invalid_grant: code not found, expired, or PKCE mismatch');
      return new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sub = authCode.institutionalEmail;
    const email = authCode.institutionalEmail;

    const accessToken = await createAccessToken({ sub, institutionalEmail: email });
    const idToken = await createIdToken({ sub, email, name: authCode.name, nonce: authCode.nonce, accessToken });

    await logAudit(db, { action: 'oidc_token', actor: email, target: clientId });

    console.log('OIDC TOKEN success: sub=' + sub);
    return new Response(JSON.stringify({
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('token error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'server_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
