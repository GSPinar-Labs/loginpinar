import { SignJWT, jwtVerify, importJWK } from 'jose';
import { ENV } from './env';

const secret = new TextEncoder().encode(ENV.JWT_SECRET);
const OIDC_KEY_ID = 'gspinar-key-2';

let _oidcPrivateKey: CryptoKey | null = null;
let _oidcPublicKey: CryptoKey | null = null;

async function getOidcPrivateKey(): Promise<CryptoKey> {
  if (!_oidcPrivateKey) {
    const jwk = JSON.parse(ENV.OIDC_PRIVATE_JWK);
    _oidcPrivateKey = await importJWK(jwk, 'RS256');
  }
  return _oidcPrivateKey;
}

async function getOidcPublicKey(): Promise<CryptoKey> {
  if (!_oidcPublicKey) {
    const jwk = JSON.parse(ENV.OIDC_PRIVATE_JWK);
    _oidcPublicKey = await importJWK({ kty: jwk.kty, n: jwk.n, e: jwk.e }, 'RS256');
  }
  return _oidcPublicKey;
}

export function getOidcPublicJWK(): Record<string, unknown> {
  try {
    const jwk = JSON.parse(ENV.OIDC_PRIVATE_JWK);
    return { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig', kid: OIDC_KEY_ID };
  } catch {
    return {};
  }
}

interface BasePayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface SessionPayload extends BasePayload {
  personalEmail: string;
  institutionalEmails: string[];
  name: string;
  admin?: boolean;
}

export async function createSessionToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15d')
    .setIssuer(ENV.OIDC_ISSUER)
    .setAudience(ENV.OIDC_ISSUER)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ENV.OIDC_ISSUER,
    audience: ENV.OIDC_ISSUER,
    clockTolerance: 60,
  });
  return payload as SessionPayload;
}

export async function createIdToken(payload: {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  nonce?: string;
  accessToken?: string;
}): Promise<string> {
  const tokenPayload: Record<string, unknown> = {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    aud: ENV.OIDC_CLIENT_ID,
    iss: ENV.OIDC_ISSUER,
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
  };
  const domain = payload.email.split('@')[1];
  if (domain) tokenPayload.hd = domain;
  if (payload.picture) tokenPayload.picture = payload.picture;
  if (payload.nonce) tokenPayload.nonce = payload.nonce;
  if (payload.accessToken) tokenPayload.at_hash = await createAtHash(payload.accessToken);

  const key = await getOidcPrivateKey();
  return new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: 'RS256', kid: OIDC_KEY_ID })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

async function createAtHash(accessToken: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  const leftHalf = new Uint8Array(hash).slice(0, 16);
  const base64 = btoa(String.fromCharCode(...leftHalf));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createAccessToken(payload: {
  sub: string;
  scope?: string;
  institutionalEmail?: string;
}): Promise<string> {
  return new SignJWT({
    ...payload,
    aud: ENV.OIDC_CLIENT_ID,
    iss: ENV.OIDC_ISSUER,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ENV.OIDC_ISSUER,
    audience: ENV.OIDC_CLIENT_ID,
    clockTolerance: 60,
  });
  return payload as { sub: string; institutionalEmail?: string; scope?: string };
}

export async function verifyIdToken(token: string): Promise<BasePayload> {
  const key = await getOidcPublicKey();
  const { payload } = await jwtVerify(token, key, {
    issuer: ENV.OIDC_ISSUER,
    audience: ENV.OIDC_CLIENT_ID,
    clockTolerance: 60,
  });
  return payload;
}
