import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/d1';
import { requireAdmin } from '../../../lib/admin-auth';
import { getAllMembers, createMember, updateMember, deleteMember, forceLogoutMember } from '../../../lib/members';
import { logAudit } from '../../../lib/audit';

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = await getDB();
  const members = await getAllMembers(db);
  return new Response(JSON.stringify({ members }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = await getDB();
    const body = await context.request.json();
    const { name, personalEmail, institutionalEmails } = body;

    if (!name || !personalEmail || !institutionalEmails || !Array.isArray(institutionalEmails)) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = await createMember(db, {
      name,
      personalEmail,
      institutionalEmails,
    });

    await logAudit(db, {
      action: 'member_create',
      actor: admin.personalEmail,
      target: personalEmail,
      details: { name, institutionalEmails },
    });

    return new Response(JSON.stringify({ success: true, id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin members ' + request.method + ' error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = await getDB();
    const body = await context.request.json();
    const { id, name, personalEmail, institutionalEmails } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta el ID del miembro' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (personalEmail !== undefined) updateData.personalEmail = personalEmail;
    if (institutionalEmails !== undefined) updateData.institutionalEmails = institutionalEmails;

    await updateMember(db, Number(id), updateData);

    await logAudit(db, {
      action: 'member_update',
      actor: admin.personalEmail,
      target: personalEmail || String(id),
      details: { updatedFields: Object.keys(updateData) },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin members PUT error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = await getDB();
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta el ID del miembro' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await deleteMember(db, Number(id));

    await logAudit(db, {
      action: 'member_delete',
      actor: admin.personalEmail,
      target: id,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin members DELETE error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PATCH: APIRoute = async (context) => {
  const admin = await requireAdmin(context);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = await getDB();
    const body = await context.request.json();
    const { id, action } = body;

    if (!id || action !== 'force-logout') {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await forceLogoutMember(db, Number(id));

    await logAudit(db, {
      action: 'member_update',
      actor: admin.personalEmail,
      target: String(id),
      details: { action: 'force_logout' },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('admin members PATCH error:', error instanceof Error ? error.message : 'unknown');
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
