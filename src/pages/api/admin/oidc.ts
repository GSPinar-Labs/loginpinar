import type { APIRoute } from "astro"
import { getDB } from "../../../lib/d1"
import { requireAdmin } from "../../../lib/admin-auth"
import { getAllClients, createClient, updateClient, deleteClient } from "../../../lib/clients"

export const GET: APIRoute = async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } })

  const db = await getDB()
  const clients = await getAllClients(db)
  return new Response(JSON.stringify({ clients }), { status: 200, headers: { "Content-Type": "application/json" } })
}

export const POST: APIRoute = async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } })

  try {
    const db = await getDB()
    const body = await context.request.json()
    const { clientId, clientSecret, redirectUris, name, description } = body

    if (!clientId || !name) {
      return new Response(JSON.stringify({ error: "Faltan datos requeridos: clientId, name" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    const id = await createClient(db, { clientId, clientSecret: clientSecret || "", redirectUris: redirectUris || [], name, description: description || "" })
    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { "Content-Type": "application/json" } })
  } catch (error) {
    console.error("admin oidc " + request.method + " error:", error instanceof Error ? error.message : "unknown")
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}

export const PUT: APIRoute = async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } })

  try {
    const db = await getDB()
    const body = await context.request.json()
    const { id, clientId, clientSecret, redirectUris, name, description, enabled } = body

    if (!id) {
      return new Response(JSON.stringify({ error: "Falta ID" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    await updateClient(db, Number(id), { clientId, clientSecret, redirectUris, name, description, enabled })
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (error) {
    console.error("admin oidc PUT error:", error instanceof Error ? error.message : "unknown")
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}

export const DELETE: APIRoute = async (context) => {
  const admin = await requireAdmin(context)
  if (!admin) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403, headers: { "Content-Type": "application/json" } })

  try {
    const db = await getDB()
    const url = new URL(context.request.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return new Response(JSON.stringify({ error: "Falta ID" }), { status: 400, headers: { "Content-Type": "application/json" } })
    }

    await deleteClient(db, Number(id))
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (error) {
    console.error("admin oidc DELETE error:", error instanceof Error ? error.message : "unknown")
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}
