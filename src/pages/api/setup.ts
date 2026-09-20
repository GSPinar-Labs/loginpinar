// API de configuración inicial (setup wizard)
// Se usa en la primera ejecución para crear el admin inicial.

import type { APIRoute } from "astro"
import { getDB } from "../../lib/d1"
import { getAdminCount, createMember } from "../../lib/members"
import { createSessionToken } from "../../lib/jwt"
import { ENV } from "../../lib/env"

export const GET: APIRoute = async () => {
  try {
    const db = await getDB()
    const count = await getAdminCount(db)
    return new Response(JSON.stringify({ needsSetup: count === 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    return new Response(JSON.stringify({ needsSetup: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const db = await getDB()
    const body = await request.json()
    const { name, personalEmail } = body

    if (!name || !personalEmail) {
      return new Response(JSON.stringify({ error: "Faltan datos requeridos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const adminCount = await getAdminCount(db)
    if (adminCount > 0) {
      return new Response(JSON.stringify({ error: "Ya existe un administrador" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const id = await createMember(db, {
      name,
      personalEmail: personalEmail.toLowerCase().trim(),
      institutionalEmails: [ENV.ADMIN_EMAIL],
    })

    const token = await createSessionToken({
      personalEmail: personalEmail.toLowerCase().trim(),
      institutionalEmails: [ENV.ADMIN_EMAIL],
      name,
      admin: true,
    })

    const cookieStr = `session_token=${token}; Path=/; Max-Age=${15 * 24 * 60 * 60}; HttpOnly; SameSite=Lax; Secure`;

    return new Response(JSON.stringify({ success: true, id }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieStr,
      },
    })
  } catch (error) {
    console.error("setup error:", error instanceof Error ? error.message : "unknown")
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
