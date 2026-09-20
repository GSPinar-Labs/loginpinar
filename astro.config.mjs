// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  // Google llama a /api/oidc/token sin cabecera Origin (server-to-server).
  // Ese endpoint se protege con client_secret + PKCE, así que desactivamos
  // el chequeo CSRF de Astro. Antes esto lo parcheaba wrapper.mjs (Cloudflare).
  security: { checkOrigin: false },
});
