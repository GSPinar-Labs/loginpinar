import { defineMiddleware } from 'astro:middleware';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Rutas server-to-server que no envían cabecera Origin (p. ej. Google → token endpoint).
const NO_ORIGIN_ROUTES = new Set(['/api/oidc/token']);

// Protección CSRF: en peticiones que cambian estado, si viene cabecera Origin y no
// coincide con el host, se bloquea. Los navegadores siempre envían Origin en
// peticiones cross-site, así que esto cubre los ataques CSRF.
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  if (SAFE_METHODS.has(request.method)) return next();
  if (NO_ORIGIN_ROUTES.has(url.pathname)) return next();

  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return next();
});
