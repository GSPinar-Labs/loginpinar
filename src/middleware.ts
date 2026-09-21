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
};

// Extrae el hostname de una URL o de "host:puerto" (ignora esquema y puerto, y usa el
// primer valor si llega una lista, p. ej. X-Forwarded-Host).
function hostOf(value: string): string {
  const first = value.split(',')[0].trim();
  const noScheme = first.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return noScheme.split('/')[0].split(':')[0].toLowerCase();
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  // Protección CSRF: en peticiones que cambian estado, si viene cabecera Origin y su
  // hostname no coincide con el host del request, se bloquea. Se comparan hostnames
  // (no esquema/puerto) para que funcione detrás de proxies/ingress (Azure, Netlify).
  if (!SAFE_METHODS.has(request.method) && !NO_ORIGIN_ROUTES.has(url.pathname)) {
    const origin = request.headers.get('origin');
    if (origin) {
      const expectedHost = hostOf(
        request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
      );
      const originHost = hostOf(origin);
      if (originHost && expectedHost && originHost !== expectedHost) {
        return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  const response = await next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(key)) response.headers.set(key, value);
  }

  return response;
});
