# LifeOS

Aplicación personal de gestión financiera (Next.js + Supabase) construida con arquitectura modular (clean architecture) y desarrollo guiado por especificaciones (OpenSpec).

## Stack

- **Next.js 15** (App Router, React 19) + **TypeScript 5**
- **Supabase** (Postgres + Auth + PostgREST), stack local con Docker
- **pnpm** como gestor de dependencias
- **Vitest** + **Testing Library** para unit e integración
- **pgTAP** (`supabase test db`) para la capa de base de datos
- Convención de commits: [Conventional Commits](https://www.conventionalcommits.org/)

## Prerrequisitos

| Herramienta  | Versión verificada | Cómo comprobar   |
|--------------|--------------------|------------------|
| Node.js      | 24.x               | `node -v`        |
| pnpm         | 11.x               | `pnpm -v`        |
| Docker       | cualquier reciente | `docker --version` |
| Supabase CLI | 2.x                | `supabase --version` |

Instala pnpm y Supabase CLI si no los tienes:

```powershell
npm install -g pnpm
npm install -g supabase
```

## Clonar e instalar (paso a paso)

Desde PowerShell (u otra terminal), en la carpeta donde quieras trabajar:

```powershell
# 1. Clona el repositorio
git clone https://github.com/naustdio/lifeOS.git
cd lifeOS

# 2. Instala las dependencias
pnpm install

# 3. Arranca el stack local de Supabase (Docker). Descarga las imágenes la primera vez.
supabase start

# 4. Crea tu archivo de entorno a partir de la plantilla
Copy-Item .env.example .env.local
```

> Si `supabase start` falla, asegúrate de que Docker Desktop esté corriendo y reinicia el comando. La primera ejecución tarda varios minutos.

## Variables de entorno (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key del stack local>
```

El proyecto usa **puertos custom** (`config.toml`): la API corre en el `55321`, no en el `54321` por defecto. La `anon key` se obtiene con:

```powershell
supabase status
```

Copia el valor `anon key` que muestra `supabase status` y pégalo en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La URL es siempre `http://127.0.0.1:55321` en local.

Opcional (solo si quieres probar el login con Google en local):

```env
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```

Sin esas variables **no hace falta nada más**: la app tiene un botón de desarrollo (`dev login`) que crea e inicia sesión con un usuario local automáticamente (`src/app/(public)/entrar/dev-login-action.ts`), sin pasar por Google. Está restringido a `NODE_ENV !== "production"`, así que nunca actúa en producción.

`.env.local` **no se commitea** (está en `.gitignore`). Cada colaborador crea el suyo.

## Levantar el proyecto

```powershell
pnpm dev
```

Abre `http://localhost:3000`. Pulsa "Entrar" y usa el botón de desarrollo para iniciar sesión sin Google.

## Verificar antes de tocar código

```powershell
pnpm test        # suite de unit + integración (Vitest)
pnpm typecheck   # TypeScript sin emisión
pnpm lint        # ESLint
pnpm verify      # todo lo anterior + build de producción
```

`pnpm verify` es el comando de referencia: si pasa, el repo está sano. Para las pruebas de base de datos (pgTAP), con el stack local arriba:

```powershell
supabase test db
```

## Flujo de colaboración

Reglas básicas para trabajar en el mismo repo sin pisarse:

1. **Nunca commitees directo a `main`.** Crea una rama por tarea.
2. **Antes de empezar y antes de pushear, sincroniza** para minimizar conflictos:

   ```powershell
   git fetch origin
   git pull origin main
   ```

3. **Una rama por tarea:**

   ```powershell
   git checkout -b feat/descripcion-corta
   ```

   Sufijos sugeridos: `feat/...`, `fix/...`, `refactor/...`, `docs/...`.

4. **Commits con convención convencional** (el historial del repo la usa):

   ```
   feat(finance): implement compra a meses
   fix(finance): post only installment #1 immediately
   ```

   Estructura: `tipo(alcance): descripción`. Tipos comunes: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. **No añadas firmas de atribución IA** tipo "Co-Authored-By".

5. **Antes de crear el Pull Request**, verifica localmente:

   ```powershell
   pnpm verify
   ```

6. **Sube la rama y abre el PR:**

   ```powershell
   git push -u origin feat/descripcion-corta
   ```

   Crea el PR contra `main` en GitHub. Al menos un colaborador lo revisa antes de mergear.

7. **Mantén `main` siempre verde**: nunca mergees algo que no pase `pnpm verify`.

## Actualizar tu copia

```powershell
git pull origin main
pnpm install        # si cambió package.json/pnpm-lock.yaml
supabase db reset   # si cambió supabase/migrations (recrea la BD local con las migraciones al día)
pnpm dev
```

> `supabase db reset` **destruye los datos locales** de la BD y la recrea desde cero aplicando las migraciones. Úsalo solo cuando haya migraciones nuevas.

## Todo automático: prompt para que lo haga el agente

Si usas un agente (p.ej. opencode) en el PC nuevo, pega este prompt tras clonar para que prepare todo él solo:

```text
Estoy en el repo LifeOS recién clonado. Configura el entorno de desarrollo completo:

1. Ejecuta `pnpm install` y comprueba que termina sin errores.
2. Comprueba si Docker está corriendo; si no, dímelo antes de continuar.
3. Ejecuta `supabase start` y espera a que el stack quede sano.
4. Ejecuta `supabase status` y lee el valor de la `anon key`.
5. Crea `.env.local` (NUNCA lo subas a git) con:
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key obtenida en el paso 4>
6. Ejecuta `pnpm verify` y confírmame que pasa de punta a punta.
7. Levanta `pnpm dev` en segundo plano y confirma que http://localhost:3000 responde.

Cuando termines, resúmeme: qué versión de Node/pnpm/Docker/Supabase hay,
si `pnpm verify` pasó, y cómo arrancar la app.
```

## Problemas frecuentes

- **`supabase start` no arranca** → Docker Desktop apagado o puertos ocupados. Cierra otras instancias de Supabase y reintenta.
- **Error de conexión a Supabase en la app** → revisa que `NEXT_PUBLIC_SUPABASE_URL` sea `http://127.0.0.1:55321` (puerto 55321, no 54321).
- **Cambios en migraciones** → `supabase db reset` para que la BD local quede al día.
- **Conflictos al mergear** → `git pull origin main`, resuelve, `pnpm verify` y sigue.
