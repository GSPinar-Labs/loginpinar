import type { APIRoute } from 'astro';
import { ENV } from '../../../lib/env';
import { getDB } from '../../../lib/d1';
import { verifySessionToken } from '../../../lib/jwt';
import { createAuthorizationCode } from '../../../lib/oidc-store';
import { getClientById, validateRedirectUri } from '../../../lib/clients';
import { logAudit } from '../../../lib/audit';
import { isSessionValid } from '../../../lib/members';

export const GET: APIRoute = async ({ request, redirect }) => {
  const db = getDB();
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const responseType = url.searchParams.get('response_type');
  const scope = url.searchParams.get('scope') || '';
  const state = url.searchParams.get('state') || '';
  const nonce = url.searchParams.get('nonce') || '';
  const codeChallenge = url.searchParams.get('code_challenge') || '';
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') || (codeChallenge ? 'S256' : '');
  const loginHint = url.searchParams.get('login_hint') || '';

  if (!clientId || !redirectUri || responseType !== 'code') {
    return new Response('Parámetros OIDC inválidos', { status: 400 });
  }

  if (codeChallenge && codeChallengeMethod !== 'S256') {
    return new Response('code_challenge_method no soportado', { status: 400 });
  }

  const client = await getClientById(db, clientId);
  if (!client) {
    return new Response('client_id no válido', { status: 400 });
  }

  if (!validateRedirectUri(client, redirectUri)) {
    return new Response('redirect_uri no válido para este cliente', { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const sessionMatch = cookieHeader.match(/session_token=([^;]+)/);
  const sessionToken = sessionMatch ? sessionMatch[1] : '';

  let session: Awaited<ReturnType<typeof verifySessionToken>> | null = null;

  if (sessionToken) {
    try {
      session = await verifySessionToken(sessionToken);
    } catch {
      session = null;
    }
  }

  if (session) {
    const valid = await isSessionValid(db, session.personalEmail, session.iat as number);
    if (!valid) session = null;
  }

  if (!session) {
    const loginUrl = new URL('/login', ENV.APP_URL);
    loginUrl.searchParams.set('oidc_client_id', clientId);
    loginUrl.searchParams.set('oidc_redirect_uri', redirectUri);
    loginUrl.searchParams.set('oidc_state', state);
    loginUrl.searchParams.set('oidc_scope', scope);
    loginUrl.searchParams.set('oidc_nonce', nonce);
    if (codeChallenge) loginUrl.searchParams.set('oidc_code_challenge', codeChallenge);
    if (codeChallengeMethod) loginUrl.searchParams.set('oidc_code_challenge_method', codeChallengeMethod);
    if (loginHint) loginUrl.searchParams.set('oidc_login_hint', loginHint);
    return redirect(loginUrl.toString());
  }

  const isConfirmed = url.searchParams.get('confirmed') === '1';

  if (!isConfirmed) {
    const interUrl = new URL('/inter', ENV.APP_URL);
    interUrl.searchParams.set('oidc_client_id', clientId);
    interUrl.searchParams.set('oidc_redirect_uri', redirectUri);
    interUrl.searchParams.set('oidc_state', state);
    interUrl.searchParams.set('oidc_scope', scope);
    interUrl.searchParams.set('oidc_nonce', nonce);
    if (codeChallenge) interUrl.searchParams.set('oidc_code_challenge', codeChallenge);
    if (codeChallengeMethod) interUrl.searchParams.set('oidc_code_challenge_method', codeChallengeMethod);
    if (loginHint) interUrl.searchParams.set('oidc_login_hint', loginHint);
    interUrl.searchParams.set('instEmail', loginHint || session.institutionalEmails[0]);
    return redirect(interUrl.toString());
  }

  const code = crypto.randomUUID();
  let institutionalEmail = session.institutionalEmails[0];
  if (loginHint) {
    const hint = loginHint.toLowerCase().trim();
    const matchingEmail = session.institutionalEmails.find(email => email.toLowerCase().trim() === hint);
    if (matchingEmail) {
      institutionalEmail = matchingEmail.toLowerCase().trim();
    } else {
      return new Response('La sesión no corresponde al usuario solicitado por Google', { status: 403 });
    }
  }

  await createAuthorizationCode(db, {
    code,
    personalEmail: session.personalEmail,
    institutionalEmail,
    name: session.name,
    redirectUri,
    clientId,
    nonce: nonce || undefined,
    codeChallenge: codeChallenge || undefined,
  });

  await logAudit(db, {
    action: 'oidc_authorize',
    actor: session.personalEmail,
    target: institutionalEmail,
    details: { clientId, name: session.name },
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  return redirect(redirectUrl.toString());
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const db = getDB();
  const body = await request.formData();
  const clientId = body.get('client_id') as string;
  const redirectUri = body.get('redirect_uri') as string;
  const responseType = body.get('response_type') as string;
  const state = body.get('state') as string || '';
  const nonce = body.get('nonce') as string || '';
  const codeChallenge = body.get('code_challenge') as string || '';
  const codeChallengeMethod = body.get('code_challenge_method') as string || (codeChallenge ? 'S256' : '');
  const scope = body.get('scope') as string || '';
  const loginHint = body.get('login_hint') as string || '';

  if (!clientId || !redirectUri || responseType !== 'code') {
    return new Response('Parámetros OIDC inválidos', { status: 400 });
  }

  if (codeChallenge && codeChallengeMethod !== 'S256') {
    return new Response('code_challenge_method no soportado', { status: 400 });
  }

  const client = await getClientById(db, clientId);
  if (!client) {
    return new Response('client_id no válido', { status: 400 });
  }

  if (!validateRedirectUri(client, redirectUri)) {
    return new Response('redirect_uri no válido para este cliente', { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const sessionMatch = cookieHeader.match(/session_token=([^;]+)/);
  const sessionToken = sessionMatch ? sessionMatch[1] : '';

  let session: Awaited<ReturnType<typeof verifySessionToken>> | null = null;

  if (sessionToken) {
    try {
      session = await verifySessionToken(sessionToken);
    } catch {
      session = null;
    }
  }

  if (session) {
    const valid = await isSessionValid(db, session.personalEmail, session.iat as number);
    if (!valid) session = null;
  }

  if (!session) {
    const loginUrl = new URL('/login', ENV.APP_URL);
    loginUrl.searchParams.set('oidc_client_id', clientId);
    loginUrl.searchParams.set('oidc_redirect_uri', redirectUri);
    loginUrl.searchParams.set('oidc_state', state);
    loginUrl.searchParams.set('oidc_nonce', nonce);
    loginUrl.searchParams.set('oidc_scope', scope);
    if (codeChallenge) loginUrl.searchParams.set('oidc_code_challenge', codeChallenge);
    if (codeChallengeMethod) loginUrl.searchParams.set('oidc_code_challenge_method', codeChallengeMethod);
    if (loginHint) loginUrl.searchParams.set('oidc_login_hint', loginHint);
    return redirect(loginUrl.toString());
  }

  const isConfirmed = body.get('confirmed') === '1';

  if (!isConfirmed) {
    const interUrl = new URL('/inter', ENV.APP_URL);
    interUrl.searchParams.set('oidc_client_id', clientId);
    interUrl.searchParams.set('oidc_redirect_uri', redirectUri);
    interUrl.searchParams.set('oidc_state', state);
    interUrl.searchParams.set('oidc_scope', scope);
    interUrl.searchParams.set('oidc_nonce', nonce);
    if (codeChallenge) interUrl.searchParams.set('oidc_code_challenge', codeChallenge);
    if (codeChallengeMethod) interUrl.searchParams.set('oidc_code_challenge_method', codeChallengeMethod);
    if (loginHint) interUrl.searchParams.set('oidc_login_hint', loginHint);
    interUrl.searchParams.set('instEmail', loginHint || session.institutionalEmails[0]);
    return redirect(interUrl.toString());
  }

  const code = crypto.randomUUID();
  let institutionalEmail = session.institutionalEmails[0];
  if (loginHint) {
    const hint = loginHint.toLowerCase().trim();
    const matchingEmail = session.institutionalEmails.find(email => email.toLowerCase().trim() === hint);
    if (matchingEmail) {
      institutionalEmail = matchingEmail.toLowerCase().trim();
    } else {
      return new Response('La sesión no corresponde al usuario solicitado por Google', { status: 403 });
    }
  }

  await createAuthorizationCode(db, {
    code,
    personalEmail: session.personalEmail,
    institutionalEmail,
    name: session.name,
    redirectUri,
    clientId,
    nonce: nonce || undefined,
    codeChallenge: codeChallenge || undefined,
  });
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  return redirect(redirectUrl.toString());
};
