# Firma Fácil

Aplicación web sencilla para enviar un documento PDF a firmar: subes el PDF,
colocas un recuadro donde debe ir la firma, pones los datos del firmante y
la aplicación le envía un correo con un enlace. Esa persona abre el enlace
(queda registrado cuándo lo abrió), dibuja su firma con el dedo o el mouse,
y al confirmar, tanto ella como tú reciben el PDF ya firmado por correo.

No está pensada para muchos usuarios a la vez ni para volúmenes grandes:
es una herramienta simple para uso personal / de un solo remitente.

## Qué necesitas (todo gratis)

1. Una cuenta de **Supabase** (ya la tienes) → base de datos + almacenamiento del PDF.
2. Una cuenta de **Brevo** (gratis, 300 correos/día) → para enviar los correos.
3. Tu cuenta de **GitHub** (ya la tienes) → para subir el código.
4. Tu cuenta de **Vercel** (ya la tienes) → para publicar la app, gratis.

---

## Paso 1 — Configurar Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com) (o crea uno nuevo si no tienes ninguno todavía, es gratis).
2. Ve a **SQL Editor** → **New query**, pega todo el contenido del archivo [`sql/schema.sql`](./sql/schema.sql) de este proyecto, y dale **Run**. Esto crea la tabla `documents`.
3. Ve a **Storage** → **New bucket**. Nómbralo exactamente `documents` y déjalo como **privado** (no marques "Public bucket").
4. Ve a **Settings → API**. Ahí vas a copiar dos valores que necesitas más adelante:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **service_role key** (una clave larga, en la sección "Project API keys" — es secreta, no la compartas ni la subas a GitHub).

## Paso 2 — Configurar Brevo para enviar correos

1. Crea una cuenta gratis en [app.brevo.com](https://app.brevo.com).
2. Ve a **Senders, Domains & Dedicated IPs → Senders → Add a sender**, pon el correo desde el que quieres enviar (puede ser tu Gmail normal) y verifícalo abriendo el correo de confirmación que te llega.
3. Ve a **SMTP & API → SMTP** y genera una nueva **SMTP key**. Copia esa clave: es tu `SMTP_PASSWORD`.
4. Tu `SMTP_USER` es el correo con el que creaste la cuenta de Brevo, y `MAIL_FROM_EMAIL` es el correo que verificaste en el paso 2 (puede ser el mismo).

## Paso 3 — Subir el código a GitHub

Como ya tienes cuenta de GitHub, desde tu computador (con git instalado):

```bash
cd firma-facil
git init
git add .
git commit -m "Primera versión de Firma Fácil"
```

Luego crea un repositorio nuevo y vacío en GitHub (sin README, sin .gitignore — este proyecto ya trae el suyo), y sigue las instrucciones que te da GitHub para conectarlo, algo como:

```bash
git remote add origin https://github.com/TU_USUARIO/firma-facil.git
git branch -M main
git push -u origin main
```

## Paso 4 — Publicar en Vercel

1. Entra a [vercel.com](https://vercel.com), **Add New → Project**, y elige el repositorio `firma-facil` que acabas de subir.
2. Antes de darle "Deploy", abre la sección **Environment Variables** y agrega estas (los valores salen de los pasos 1 y 2):

   | Nombre | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | tu Project URL de Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | tu secret key de Supabase |
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | el correo con el que creaste la cuenta de Brevo |
   | `SMTP_PASSWORD` | la SMTP key que generaste en Brevo |
   | `MAIL_FROM_EMAIL` | el correo remitente que verificaste en Brevo |
   | `MAIL_FROM_NAME` | `Firma Fácil` (o el nombre que quieras que vea la gente) |
   | `OWNER_EMAIL` | el correo donde quieres recibir copia de cada documento firmado |
   | `ADMIN_USER` | un usuario para entrar tú a la app, ej. `admin` |
   | `ADMIN_PASSWORD` | una clave segura, solo tú la debes saber |
   | `NEXT_PUBLIC_APP_URL` | déjalo vacío por ahora, lo llenas en el paso siguiente |

3. Dale **Deploy** y espera a que termine (1-2 minutos).
4. Cuando termine, Vercel te da una URL como `https://firma-facil-tuusuario.vercel.app`. Cópiala.
5. Ve a **Settings → Environment Variables**, edita `NEXT_PUBLIC_APP_URL` y pon esa misma URL (sin `/` al final).
6. Ve a **Deployments**, entra al último y dale **Redeploy** para que tome ese valor.

¡Listo! Ya tienes tu aplicación funcionando en esa URL.

## Cómo se usa

1. Entra a tu URL (te va a pedir el usuario/clave que pusiste en `ADMIN_USER` / `ADMIN_PASSWORD`).
2. Sube el PDF, arrastra el recuadro azul a donde debe ir la firma (y ajusta su tamaño con la esquina), llena el nombre, cédula y correo de quien firma, y dale **Enviar para firma**.
3. La persona recibe un correo con un botón para abrir y firmar el documento. En cuanto lo abre, queda registrado en el panel (`/panel`, el enlace "Ver documentos enviados").
4. La persona ve el documento completo y dibuja su firma con el dedo o el mouse, y le da **Firmar y enviar**.
5. En ese momento la app inserta la firma exactamente en el recuadro que tú definiste, genera el PDF firmado, y les envía ese PDF por correo tanto a la persona que firmó como a ti (`OWNER_EMAIL`).
6. En `/panel` puedes ver en todo momento el estado de cada documento: Enviado, Abierto o Firmado, con fecha y hora.

## Límites de esta versión (a propósito, para mantenerla simple)

- Un solo firmante por documento (no varias personas firmando el mismo PDF).
- El recuadro de firma es de tamaño/posición fija una vez enviado el documento.
- No hay creación de varias cuentas de usuario: solo tú entras con `ADMIN_USER` / `ADMIN_PASSWORD`.
- Los correos se envían con tu Gmail personal — Gmail limita a unos 500 correos por día, más que suficiente para uso personal.
- Los archivos se guardan en Supabase Storage (plan gratis: 1 GB), no en Google Drive. Si en el futuro quieres que además queden en tu Drive, se puede agregar más adelante.

## Desarrollo local (opcional)

Si quieres probarlo en tu computador antes de tocar producción:

```bash
npm install
cp .env.example .env.local   # y llena los valores
npm run dev
```

Abre `http://localhost:3000`.
