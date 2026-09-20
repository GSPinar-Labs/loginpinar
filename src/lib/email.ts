// Servicio de correo electrónico
// Primario: SendPulse API (OAuth2) — funciona en Workers y Node.js
// Fallback: SMTP real (nodemailer) — solo Node.js, cuando SendPulse no está configurado

import { ENV } from "./env";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface AuditLog {
  action: string;
  actor: string;
  target?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── SendPulse API (OAuth2) ──────────────────────────────────────────

let _spToken: { token: string; expires: number } | null = null;

async function getSendPulseToken(): Promise<string> {
  if (_spToken && Date.now() < _spToken.expires) return _spToken.token;

  const res = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: ENV.SENDPULSE_CLIENT_ID,
      client_secret: ENV.SENDPULSE_CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendPulse auth error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  _spToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function sendViaSendPulse(payload: EmailPayload): Promise<void> {
  const token = await getSendPulseToken();
  const plainText =
    payload.text ||
    payload.html
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const bytes = new TextEncoder().encode(payload.html);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const htmlBase64 = btoa(binary);

  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: {
        subject: payload.subject,
        html: htmlBase64,
        text: plainText,
        from: { name: "GSPinar SSO", email: ENV.EMAIL_FROM },
        to: [{ name: payload.to, email: payload.to }],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendPulse API error (${res.status}): ${text}`);
  }
}

// ── SMTP real (nodemailer, solo Node.js) ────────────────────────────

async function sendViaSMTP(payload: EmailPayload): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.default.createTransport({
    host: ENV.SMTP_HOST,
    port: Number(ENV.SMTP_PORT) || 587,
    secure: Number(ENV.SMTP_PORT) === 465,
    auth: {
      user: ENV.SMTP_USER,
      pass: ENV.SMTP_PASS,
    },
  });

  await transport.sendMail({
    from: `GSPinar SSO <${ENV.EMAIL_FROM}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  transport.close();
}

// ── Envío principal ──────────────────────────────────────────────────

async function sendEmail(payload: EmailPayload): Promise<void> {
  // 1) SendPulse API como método principal
  if (ENV.SENDPULSE_CLIENT_ID && ENV.SENDPULSE_CLIENT_SECRET) {
    await sendViaSendPulse(payload);
    return;
  }

  // 2) SMTP real como fallback (solo Node.js, requiere SMTP_HOST + USER)
  if (ENV.SMTP_HOST && ENV.SMTP_USER) {
    try {
      await sendViaSMTP(payload);
      return;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Cannot find module")) {
        throw new Error(
          "SendPulse no configurado y nodemailer no disponible en Workers. Configura SENDPULSE_CLIENT_ID y SENDPULSE_CLIENT_SECRET.",
        );
      }
      throw err;
    }
  }

  throw new Error(
    "No hay proveedor de email configurado. Configura SENDPULSE_CLIENT_ID/SECRET o SMTP_HOST/USER/PASS.",
  );
}

// ── API pública ──────────────────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  code: string,
  gspEmail: string,
): Promise<void> {
  const safeEmail = escapeHtml(gspEmail);
  const safeCode = escapeHtml(code);

  await sendEmail({
    to,
    subject: "Tu código de verificación para GSPinar",
    html: `

    <div
        style='font-family: "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", sans-serif; max-width: 600px; margin: 0 auto;'
    >
        <h2 style="font-family: Montserrat, sans-serif; font-weight: 400;">
            Grupo Scout Pinar
        </h2>
        <hr />
        <br />
        <p>
            Has solicitado acceso a la cuenta <strong>${safeEmail}</strong> vinculada
            al Grupo Scout Pinar.
        </p>
        <p>Tu código de verificación es:</p>
        <div
            style='font-family: "Atkinson Hyperlegible Mono", "DM Mono", monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #f0f0f0; text-align: center;'
        >
            ${safeCode}
        </div>
        <p>Este código expira en 15 minutos.</p>
        <p>
            Si no has solicitado este código, contacta con el cargo TIC o responde a
            este correo.
        </p>
    </div>
    `,
  });
}

export async function sendWeeklyReport(
  to: string,
  weekKey: string,
  logs: AuditLog[],
): Promise<void> {
  const actionLabels: Record<string, string> = {
    login_success: "Inicio de sesión",
    login_fail: "Fallo de login",
    otp_sent: "OTP enviado",
    oidc_authorize: "SSO autorizado",
    member_create: "Miembro creado",
    member_update: "Miembro actualizado",
    member_delete: "Miembro eliminado",
    admin_login: "Acceso admin",
  };

  const rows = logs
    .map(
      (log) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date(log.timestamp).toLocaleString("es-ES")}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(actionLabels[log.action] || log.action)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(log.actor)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${escapeHtml(log.target || "-")}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${log.details ? escapeHtml(JSON.stringify(log.details)) : "-"}</td>
    </tr>
  `,
    )
    .join("");

  await sendEmail({
    to,
    subject: `Informe semanal de auditoría GSPinar SSO - ${weekKey}`,
    html: `
      <div style="font-family: sans-serif; max-width: 900px; margin: 0 auto;">
        <h2>Informe semanal de auditoría - GSPinar SSO</h2>
        <p>Semana: <strong>${weekKey}</strong></p>
        <p>Total de eventos: <strong>${logs.length}</strong></p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 1rem;">
          <thead>
            <tr style="background: #1a1a2e; color: white;">
              <th style="padding: 10px; text-align: left;">Fecha/Hora</th>
              <th style="padding: 10px; text-align: left;">Acción</th>
              <th style="padding: 10px; text-align: left;">Actor</th>
              <th style="padding: 10px; text-align: left;">Objetivo</th>
              <th style="padding: 10px; text-align: left;">Detalles</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="padding: 10px; text-align: center;">Sin eventos esta semana</td></tr>'}
          </tbody>
        </table>
        <p style="margin-top: 2rem; color: #666; font-size: 0.9rem;">
          Este informe se genera automáticamente cada sábado a las 19:00h. Los logs se han eliminado de la base de datos.
        </p>
      </div>
    `,
  });
}
