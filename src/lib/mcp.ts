import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDB } from './d1';
import {
  getAllMembers,
  getMemberById,
  findMemberByPersonalEmail,
  createMember,
  updateMember,
  deleteMember,
  forceLogoutMember,
  type Member,
} from './members';
import { logAudit } from './audit';

const ACTOR = 'mcp';

function text(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

function serializeMember(member: Member) {
  return {
    id: member.id,
    name: member.name,
    personalEmail: member.personalEmail,
    institutionalEmails: member.institutionalEmails,
  };
}

async function resolveMember(id?: number, personalEmail?: string): Promise<Member | null> {
  const db = getDB();
  if (typeof id === 'number') return getMemberById(db, id);
  if (personalEmail) return findMemberByPersonalEmail(db, personalEmail);
  return null;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

// Metadatos de las herramientas expuestas por el servidor MCP (para el panel de admin).
export const MCP_TOOLS: McpToolInfo[] = [
  {
    name: 'listar_miembros',
    description:
      'Lista todos los miembros con su id, nombre, correo personal y correos institucionales (secciones y cargos).',
  },
  {
    name: 'ver_miembro',
    description: 'Obtiene la ficha de un miembro por su id o por su correo personal.',
  },
  {
    name: 'crear_miembro',
    description:
      'Añade un nuevo miembro. El correo personal es obligatorio y único; opcionalmente se le asignan correos institucionales.',
  },
  {
    name: 'asignar_correos',
    description:
      'Asigna (reemplaza) la lista completa de correos institucionales de un miembro.',
  },
  {
    name: 'anadir_correo',
    description: 'Añade un correo institucional a un miembro sin quitar los que ya tenga.',
  },
  {
    name: 'eliminar_miembro',
    description: 'Elimina un miembro por su id o por su correo personal.',
  },
  {
    name: 'cerrar_sesion',
    description:
      'Fuerza el cierre de sesión de un miembro (invalida su sesión actual). Identifícalo por id o por correo personal.',
  },
];

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'gspinar-miembros', version: '1.0.0' });

  server.registerTool(
    'listar_miembros',
    {
      description:
        'Lista todos los miembros del Grupo Scout Pinar con su id, nombre, correo personal y correos institucionales (secciones y cargos).',
      inputSchema: {},
    },
    async () => {
      const db = getDB();
      const members = await getAllMembers(db);
      return text({ total: members.length, miembros: members.map(serializeMember) });
    }
  );

  server.registerTool(
    'ver_miembro',
    {
      description: 'Obtiene la ficha de un miembro por su id o por su correo personal.',
      inputSchema: {
        id: z.number().int().optional().describe('ID numérico del miembro'),
        personalEmail: z.string().optional().describe('Correo personal del miembro'),
      },
    },
    async ({ id, personalEmail }) => {
      if (id === undefined && !personalEmail) return fail('Indica "id" o "personalEmail".');
      const member = await resolveMember(id, personalEmail);
      if (!member) return fail('Miembro no encontrado.');
      return text(serializeMember(member));
    }
  );

  server.registerTool(
    'crear_miembro',
    {
      description:
        'Añade un nuevo miembro. El correo personal es obligatorio y único. Opcionalmente se le asignan correos institucionales (secciones/cargos).',
      inputSchema: {
        name: z.string().min(1).describe('Nombre completo del miembro'),
        personalEmail: z.string().min(1).describe('Correo personal (usado para el login)'),
        institutionalEmails: z
          .array(z.string())
          .optional()
          .describe('Correos institucionales a asignar (p. ej. lobatos@gruposcoutpinar.com)'),
      },
    },
    async ({ name, personalEmail, institutionalEmails }) => {
      const db = getDB();
      const existing = await findMemberByPersonalEmail(db, personalEmail);
      if (existing) {
        return fail(`Ya existe un miembro con el correo personal ${personalEmail} (id ${existing.id}).`);
      }
      const id = await createMember(db, {
        name,
        personalEmail,
        institutionalEmails: institutionalEmails ?? [],
      });
      await logAudit(db, {
        action: 'member_create',
        actor: ACTOR,
        target: personalEmail,
        details: { name, institutionalEmails: institutionalEmails ?? [], via: 'mcp' },
      });
      return text({ success: true, id, name, personalEmail, institutionalEmails: institutionalEmails ?? [] });
    }
  );

  server.registerTool(
    'asignar_correos',
    {
      description:
        'Asigna (reemplaza) la lista completa de correos institucionales de un miembro. Identifícalo por id o por correo personal.',
      inputSchema: {
        id: z.number().int().optional().describe('ID numérico del miembro'),
        personalEmail: z.string().optional().describe('Correo personal del miembro'),
        institutionalEmails: z
          .array(z.string())
          .describe('Lista completa de correos institucionales a asignar (se reemplaza la anterior)'),
      },
    },
    async ({ id, personalEmail, institutionalEmails }) => {
      if (id === undefined && !personalEmail) return fail('Indica "id" o "personalEmail".');
      const db = getDB();
      const member = await resolveMember(id, personalEmail);
      if (!member || member.id === undefined) return fail('Miembro no encontrado.');
      await updateMember(db, member.id, { institutionalEmails });
      await logAudit(db, {
        action: 'member_update',
        actor: ACTOR,
        target: member.personalEmail,
        details: { institutionalEmails, via: 'mcp' },
      });
      return text({ success: true, id: member.id, name: member.name, institutionalEmails });
    }
  );

  server.registerTool(
    'anadir_correo',
    {
      description: 'Añade un correo institucional a un miembro sin quitar los que ya tenga.',
      inputSchema: {
        id: z.number().int().optional().describe('ID numérico del miembro'),
        personalEmail: z.string().optional().describe('Correo personal del miembro'),
        email: z.string().min(1).describe('Correo institucional a añadir'),
      },
    },
    async ({ id, personalEmail, email }) => {
      if (id === undefined && !personalEmail) return fail('Indica "id" o "personalEmail".');
      const db = getDB();
      const member = await resolveMember(id, personalEmail);
      if (!member || member.id === undefined) return fail('Miembro no encontrado.');
      const normalized = email.toLowerCase().trim();
      const next = Array.from(new Set([...member.institutionalEmails, normalized]));
      await updateMember(db, member.id, { institutionalEmails: next });
      await logAudit(db, {
        action: 'member_update',
        actor: ACTOR,
        target: member.personalEmail,
        details: { added: normalized, institutionalEmails: next, via: 'mcp' },
      });
      return text({ success: true, id: member.id, institutionalEmails: next });
    }
  );

  server.registerTool(
    'eliminar_miembro',
    {
      description: 'Elimina un miembro por su id o por su correo personal.',
      inputSchema: {
        id: z.number().int().optional().describe('ID numérico del miembro'),
        personalEmail: z.string().optional().describe('Correo personal del miembro'),
      },
    },
    async ({ id, personalEmail }) => {
      if (id === undefined && !personalEmail) return fail('Indica "id" o "personalEmail".');
      const db = getDB();
      const member = await resolveMember(id, personalEmail);
      if (!member || member.id === undefined) return fail('Miembro no encontrado.');
      await deleteMember(db, member.id);
      await logAudit(db, {
        action: 'member_delete',
        actor: ACTOR,
        target: member.personalEmail,
        details: { via: 'mcp', eliminated: serializeMember(member) },
      });
      return text({ success: true, eliminado: serializeMember(member) });
    }
  );

  server.registerTool(
    'cerrar_sesion',
    {
      description:
        'Fuerza el cierre de sesión de un miembro (invalida su sesión actual). Identifícalo por id o por correo personal.',
      inputSchema: {
        id: z.number().int().optional().describe('ID numérico del miembro'),
        personalEmail: z.string().optional().describe('Correo personal del miembro'),
      },
    },
    async ({ id, personalEmail }) => {
      if (id === undefined && !personalEmail) return fail('Indica "id" o "personalEmail".');
      const db = getDB();
      const member = await resolveMember(id, personalEmail);
      if (!member || member.id === undefined) return fail('Miembro no encontrado.');
      await forceLogoutMember(db, member.id);
      await logAudit(db, {
        action: 'member_update',
        actor: ACTOR,
        target: member.personalEmail,
        details: { action: 'force_logout', via: 'mcp' },
      });
      return text({ success: true, id: member.id, name: member.name });
    }
  );

  return server;
}
