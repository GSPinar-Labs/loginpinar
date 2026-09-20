import { defineMiddleware } from 'astro:middleware';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Rutas server-to-server que no envían cabecera Origin (p. ej. Google → token endpoint).
const NO_ORIGIN_ROUTES = new Set(['/api/oidc/token']);

// Cabeceras de seguridad aplicadas a todas las respuestas SSR.
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // Protección CSRF: en peticiones que cambian estado, si viene cabecera Origin y no
  // coincide con el host, se bloquea. Los navegadores siempre envían Origin en
  // peticiones cross-site, así que esto cubre los ataques CSRF.
  if (!SAFE_METHODS.has(request.method) && !NO_ORIGIN_ROUTES.has(url.pathname)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) {
      return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const response = await next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(key)) response.headers.set(key, value);
  }

  return response;
});
