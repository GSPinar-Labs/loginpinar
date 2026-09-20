function getEnvVar(name: string, defaultValue?: string): string {
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name] as string;
  }
  const viteEnv = (import.meta.env as Record<string, string>)?.[name];
  if (viteEnv) return viteEnv;
  if (defaultValue !== undefined) return defaultValue;
  return '';
}

export const ENV = {
  get TURSO_DATABASE_URL() { return getEnvVar('TURSO_DATABASE_URL'); },
  get TURSO_AUTH_TOKEN() { return getEnvVar('TURSO_AUTH_TOKEN'); },
  get SMTP_HOST() { return getEnvVar('SMTP_HOST'); },
  get SMTP_PORT() { return getEnvVar('SMTP_PORT', '587'); },
  get SMTP_USER() { return getEnvVar('SMTP_USER'); },
  get SMTP_PASS() { return getEnvVar('SMTP_PASS'); },
  get SENDPULSE_CLIENT_ID() { return getEnvVar('SENDPULSE_CLIENT_ID'); },
  get SENDPULSE_CLIENT_SECRET() { return getEnvVar('SENDPULSE_CLIENT_SECRET'); },
  get EMAIL_FROM() { return getEnvVar('EMAIL_FROM', 'noreply@gruposcoutpinar.com'); },
  get JWT_SECRET() { return getEnvVar('JWT_SECRET'); },
  get OIDC_CLIENT_ID() { return getEnvVar('OIDC_CLIENT_ID', 'google-workspace'); },
  get OIDC_CLIENT_SECRET() { return getEnvVar('OIDC_CLIENT_SECRET'); },
  get OIDC_ISSUER() { return getEnvVar('OIDC_ISSUER', 'http://localhost:4321'); },
  get APP_URL() { return getEnvVar('APP_URL', 'http://localhost:4321'); },
  get CRON_SECRET() { return getEnvVar('CRON_SECRET'); },
  get MCP_SECRET() { return getEnvVar('MCP_SECRET'); },
  get ADMIN_EMAIL() { return getEnvVar('ADMIN_EMAIL', 'web@gruposcoutpinar.com'); },
  get GOOGLE_REDIRECT_URI() { return getEnvVar('GOOGLE_REDIRECT_URI', 'https://accounts.google.com/oidcrp/03ys488c32tw7pc/cb'); },
  get MAX_OTP_ATTEMPTS() { return Number(getEnvVar('MAX_OTP_ATTEMPTS', '5')); },
  get OIDC_PRIVATE_JWK() { return getEnvVar('OIDC_PRIVATE_JWK'); },
  get DB_TYPE() { return getEnvVar('DB_TYPE', 'd1'); },
};

export function validateEnv() {
  const required = ['JWT_SECRET', 'OIDC_CLIENT_SECRET'];
  const missing = required.filter(key => !getEnvVar(key));
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`);
  }
}
