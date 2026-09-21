# GSPinar SSO — Guía de configuración

> Sistema de Single Sign-On para el Grupo Scout Pinar. Permite a los miembros acceder a sus cuentas `@gruposcoutpinar.com` verificándose desde su correo personal.
>
> **Arquitectura:** Astro 7 (SSR) + Azure Container Apps + Turso (libSQL) + SendPulse
>
> **URL de producción:** `https://login.gspinar.com`

---

## Índice

1. [Desarrollo local](#desarrollo-local)
2. [Variables de entorno](#variables-de-entorno)
3. [Base de datos (Turso)](#base-de-datos-turso)
4. [Despliegue en Azure](#despliegue-en-azure-container-apps)
5. [Configurar Google Workspace OIDC](#configurar-google-workspace-oidc)
6. [Crear el primer administrador](#crear-el-primer-administrador)
7. [Dominio personalizado](#dominio-personalizado)
8. [Servidor MCP](#servidor-mcp)
9. [Seguridad](#seguridad)
10. [Estructura de la base de datos](#estructura-de-la-base-de-datos)

---

## Desarrollo local

### 1. Clonar e instalar

```bash
npm install
```

### 2. Configurar `.env`

Copia `.env.example` a `.env` y rellena los valores:

```bash
cp .env.example .env
```

Para desarrollo puedes usar una base de datos local en fichero:

```
TURSO_DATABASE_URL=file:./local.db
TURSO_AUTH_TOKEN=
```

### 3. Crear la base de datos local (opcional)

Aplica las migraciones de `migrations/*.sql` sobre un fichero SQLite (el cliente `@libsql/client` acepta URLs `file:`).

### 4. Iniciar

```bash
npm run dev
```

Servidor en `http://localhost:4321`.

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `TURSO_DATABASE_URL` | **Sí** | URL de Turso (`libsql://…`) o `file:./local.db` en local |
| `TURSO_AUTH_TOKEN` | **Sí** (Turso) | Token de acceso a Turso |
| `JWT_SECRET` | **Sí** | Clave HS256 para sesiones y access tokens (32+ caracteres aleatorios) |
| `OIDC_CLIENT_ID` | No | ID de cliente OIDC (default: `google-workspace`) |
| `OIDC_CLIENT_SECRET` | **Sí** | Secreto compartido con Google Admin Console |
| `OIDC_ISSUER` | No | URL del emisor OIDC (default: `http://localhost:4321`) |
| `APP_URL` | No | URL base de la app |
| `GOOGLE_REDIRECT_URI` | No | Redirect URI que da Google Admin al crear el perfil OIDC |
| `ADMIN_EMAIL` | No | Correo institucional que convierte a un miembro en admin |
| `CRON_SECRET` | **Sí** | Secreto para autenticar el cron del informe semanal |
| `MCP_SECRET` | **Sí** | Token Bearer del servidor MCP |
| `SENDPULSE_CLIENT_ID` / `SENDPULSE_CLIENT_SECRET` | **Sí** | Credenciales OAuth2 de la API de SendPulse |
| `EMAIL_FROM` | No | Remitente de los correos |
| `OIDC_PRIVATE_JWK` | **Sí** | Clave privada RSA en formato JWK (firma RS256 del `id_token`) |
| `MAX_OTP_ATTEMPTS` | No | Intentos máximos de OTP (default: `5`) |

> **Importante:** `JWT_SECRET`, `OIDC_CLIENT_SECRET`, `CRON_SECRET` y `MCP_SECRET` deben ser valores aleatorios largos y **diferentes entre sí**.

---

## Base de datos (Turso)

```bash
# Crear la base de datos
turso db create gspinar-sso

# URL de conexión
turso db show gspinar-sso --url

# Token de acceso (sin caducidad)
turso db tokens create gspinar-sso --expiration never

# Aplicar el esquema
turso db shell gspinar-sso < migrations/0001_init.sql
```

Si vienes de otra base de datos SQLite, importa el dump con `turso db shell <db> < dump.sql`.

---

## Despliegue en Azure (Container Apps)

La app se empaqueta en un contenedor (`Dockerfile`) y se ejecuta en Azure Container Apps (serverless, escala a cero). Requiere el CLI `az` y una suscripción de Azure.

```bash
# 1. Login
az login

# 2. Grupo de recursos + registro de contenedores
az group create -n gspinar-sso-rg -l spaincentral
az acr create -n <TU_REGISTRO> -g gspinar-sso-rg --sku Basic --admin-enabled true

# 3. Construir y subir la imagen (usa un tag único para evitar cachés)
TAG=$(date +%Y%m%d-%H%M%S)
az acr build -r <TU_REGISTRO> -t gspinar-sso:$TAG .

# 4. Crear el Container App (puerto 8080) con las variables de entorno
az containerapp up -n gspinar-sso -g gspinar-sso-rg --location spaincentral \
  --image <TU_REGISTRO>.azurecr.io/gspinar-sso:$TAG \
  --ingress external --target-port 8080 \
  --env-vars TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... JWT_SECRET=... \
             OIDC_CLIENT_ID=google-workspace OIDC_CLIENT_SECRET=... \
             OIDC_ISSUER=https://login.gspinar.com APP_URL=https://login.gspinar.com \
             GOOGLE_REDIRECT_URI=... ADMIN_EMAIL=... CRON_SECRET=... MCP_SECRET=... \
             SENDPULSE_CLIENT_ID=... SENDPULSE_CLIENT_SECRET=... EMAIL_FROM=... \
             OIDC_PRIVATE_JWK=...
```

> **Seguridad**: los secretos (`TURSO_AUTH_TOKEN`, `OIDC_PRIVATE_JWK`, `JWT_SECRET`, …) no se escriben en el código ni en el repositorio. Configúralos como variables de entorno o, mejor, con `az containerapp secret set` + `secretref:`.

### Actualizar la app (tras cambiar el código)

```bash
TAG=$(date +%Y%m%d-%H%M%S)
az acr build -r <TU_REGISTRO> -t gspinar-sso:$TAG .
az containerapp update -n gspinar-sso -g gspinar-sso-rg \
  --image <TU_REGISTRO>.azurecr.io/gspinar-sso:$TAG
```

---

## Configurar Google Workspace OIDC

### En Google Admin Console

1. Ve a **Seguridad → Autenticación → SSO con proveedor de identidad de terceros**
2. Haz clic en **Añadir perfil de OIDC**
3. Rellena:

   | Campo | Valor |
   |---|---|
   | Nombre del perfil | `GSPinar SSO` |
   | ID de cliente | `google-workspace` |
   | Secreto de cliente | El valor de `OIDC_CLIENT_SECRET` |
   | URL del emisor | `https://login.gspinar.com` |
   | URL de cambio de contraseña | `https://login.gspinar.com/dashboard` |

4. Guarda el perfil
5. Copia la **Redirect URI** que muestra Google y ponla en `GOOGLE_REDIRECT_URI`
6. Asigna el perfil a la unidad organizativa correspondiente

### Requisitos

Google exige que el claim `email` coincida con el correo primario del usuario, que el flujo sea **authorization code** y que la Redirect URI acepte la que genera Google. El sistema ya lo cumple: `sub` y `email` son el correo institucional (`@gruposcoutpinar.com`).

---

## Crear el primer administrador

Añade un miembro con `ADMIN_EMAIL` entre sus correos institucionales:

```sql
INSERT INTO members (name, personalEmail, institutionalEmails, createdAt, updatedAt)
VALUES ('Admin', 'tu-correo@ejemplo.com', '["web@gruposcoutpinar.com"]', datetime('now'), datetime('now'));
```

Después, inicia sesión en `https://login.gspinar.com` con ese correo y accede a `/admin`.

---

## Dominio personalizado

Apunta `login.gspinar.com` al Container App:

1. Añade el hostname: `az containerapp hostname add -n gspinar-sso -g gspinar-sso-rg --hostname login.gspinar.com`.
2. En tu DNS, crea los registros que Azure indique (TXT de verificación `asuid.*` + CNAME al hostname del Container App).
3. Azure emite el certificado TLS automáticamente.

> El dominio es el **issuer OIDC**: no debe cambiar (rompería Google Workspace y las sesiones).

---

## Servidor MCP

`POST /api/mcp` expone herramientas de gestión de miembros para agentes de IA (Streamable HTTP, autenticación Bearer con `MCP_SECRET`):

- `listar_miembros`, `ver_miembro`, `crear_miembro`, `asignar_correos`, `anadir_correo`, `cerrar_sesion`, `eliminar_miembro`

El apartado **MCP** del panel (`/admin/mcp`) muestra el endpoint, las herramientas y la actividad reciente.

---

## Seguridad

| Capa | Medida |
|---|---|
| **OTP** | 6 dígitos generados con `crypto.getRandomValues()`, expiran en 15 min, un solo uso |
| **Anti fuerza bruta** | Bloqueo tras varios intentos fallidos en 15 min |
| **Sesiones** | JWT HS256, expiran a los 15 días, issuer + audience verificados |
| **Admin** | Verificado contra la BD (no solo el claim del JWT) |
| **OIDC** | Authorization code flow con PKCE, `client_secret` obligatorio |
| **Códigos OIDC** | Un solo uso, expiran en 10 min |
| **Cron** | Endpoint protegido con `X-Cron-Secret` |
| **Email** | HTML sanitizado con `escapeHtml()` antes de insertar datos del usuario |
| **SQL** | Todas las consultas usan parámetros bindeados (`?`) |
| **Secretos** | En variables de entorno del hosting, nunca en el código ni en el repo |

---

## Estructura de la base de datos

Tablas SQLite/libSQL (ver `migrations/`):

### `members`

| Campo | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | Autoincremental |
| name | TEXT | Nombre completo |
| personalEmail | TEXT UNIQUE | Correo personal del miembro |
| institutionalEmails | TEXT (JSON) | Array de correos `@gruposcoutpinar.com` |
| force_logout_after | TEXT | Fuerza el cierre de sesión |
| createdAt / updatedAt | TEXT | ISO 8601 |

### `verification_codes`
Códigos OTP de 6 dígitos. Se marcan `used = 1` tras verificarse. Expiran a los 15 min.

### `authorization_codes`
Códigos OIDC de un solo uso con PKCE. Expiran a los 10 min.

### `oidc_clients`
Clientes OIDC (Google Workspace está hardcodeado).

### `audit_logs`
Logs de auditoría agrupados por `weekKey`. Se eliminan al enviar el informe semanal.

> **No existe columna `admin`.** Ser admin depende de tener `ADMIN_EMAIL` en `institutionalEmails`.
