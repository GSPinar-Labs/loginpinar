// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  security: {
    // Google llama a /api/oidc/token sin cabecera Origin (server-to-server).
    // Ese endpoint se protege con client_secret + PKCE, así que desactivamos
    // el chequeo CSRF de Astro (lo cubre src/middleware.ts de forma selectiva).
    checkOrigin: false,
    // CSP con hashes para los scripts/estilos inline generados por Astro.
    csp: {
      directives: [
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
});
