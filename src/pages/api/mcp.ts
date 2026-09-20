import type { APIRoute } from 'astro';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '../../lib/mcp';
import { ENV } from '../../lib/env';

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Comparación en tiempo constante (hasheando para no filtrar la longitud).
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export const ALL: APIRoute = async ({ request }) => {
  const secret = ENV.MCP_SECRET;
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

  if (!secret || !token || !(await timingSafeEqual(token, secret))) {
    return json({ error: 'No autorizado' }, 401);
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(request);
};
