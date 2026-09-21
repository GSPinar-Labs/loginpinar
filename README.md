# GSPinar SSO

Sistema de autenticación única (SSO) para el Grupo Scout Pinar. Los miembros acceden a sus cuentas `@gruposcoutpinar.com` verificándose con un código OTP enviado a su email personal, y el sistema emite un `id_token` OIDC para iniciar sesión en Google Workspace.

> **URL:** `https://login.gspinar.com` · **Stack:** Astro 7 (SSR) + Azure Container Apps · **DB:** Turso (libSQL) · **Email:** SendPulse

## Flujo

1. El miembro entra en `https://login.gspinar.com`
2. Introduce su correo institucional (`@gruposcoutpinar.com`) y su correo personal
3. Recibe un código de 6 dígitos en su correo personal
4. Introduce el código → sesión de 15 días
5. Desde el dashboard puede lanzar el SSO a Google Workspace

Para Google Workspace el flujo OIDC es transparente: si un usuario intenta acceder a Gmail sin sesión, Google lo redirige al SSO, completa el login con OTP y vuelve logueado.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 7 (SSR) |
| Runtime | Azure Container Apps (Node) |
| Base de datos | Turso (libSQL) |
| Email | SendPulse API |
| JWT | jose + Web Crypto API |
| SSO | OIDC (OpenID Connect) |

## Servidor MCP

`POST /api/mcp` expone herramientas para que agentes de IA gestionen los miembros (listar, ver, crear, asignar correos, cerrar sesión, eliminar). Autenticación con `Authorization: Bearer <MCP_SECRET>`. Ver el apartado **MCP** del panel de administración.

## Desarrollo local

```bash
npm install
# Crea un .env con las variables necesarias (ver SETUP.md)
npm run dev
```

Servidor en `http://localhost:4321`.

## Deploy

La app se empaqueta en un contenedor (`Dockerfile`) y se despliega en **Azure Container Apps** (serverless, escala a cero). Ver [SETUP.md](SETUP.md) para los pasos completos y seguros (sin secretos en el repositorio).

```bash
TAG=$(date +%Y%m%d-%H%M%S)
az acr build -r <tu-registro> -t gspinar-sso:$TAG .
az containerapp update -n gspinar-sso -g <tu-grupo> --image <tu-registro>.azurecr.io/gspinar-sso:$TAG
```

## API

| Endpoint | Descripción |
|---|---|
| `POST /api/verify-email` | Valida asociación y envía OTP |
| `POST /api/verify-code` | Valida OTP y crea sesión JWT |
| `GET /api/session` | Verifica sesión activa (incluye si es admin) |
| `GET/POST /api/oidc/authorize` | Entrada SSO OIDC |
| `POST /api/oidc/token` | Canjea código por tokens |
| `GET /api/oidc/userinfo` | Claims del usuario autenticado |
| `GET /.well-known/openid-configuration` | OIDC Discovery |
| `GET /api/oidc/jwks` | Claves públicas JWT |
| `GET/POST/PUT/DELETE /api/admin/members` | CRUD de miembros (admin) |
| `GET /api/admin/logs` | Logs de auditoría (admin) |
| `POST /api/admin/weekly-report` | Informe semanal (admin o cron) |
| `POST /api/mcp` | Servidor MCP (Bearer) |

## Seguridad

- **OTP:** 6 dígitos criptográficos (`crypto.getRandomValues`), 15 min, un solo uso
- **Anti fuerza bruta:** bloqueo tras varios intentos fallidos en 15 min
- **Sesiones:** JWT HS256 con issuer + audience verificados
- **OIDC:** authorization code flow con PKCE, `client_secret` obligatorio
- **HTML:** sanitizado antes de insertar datos de usuario
- **SQL:** consultas parametrizadas, sin concatenación de strings
- **Secretos:** en variables de entorno del hosting, nunca en el repositorio

[Guía de configuración →](SETUP.md)
