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

export const ALL: APIRoute = async ({ request }) => {
  const secret = ENV.MCP_SECRET;
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

  if (!secret || token !== secret) {
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
