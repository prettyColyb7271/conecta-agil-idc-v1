# PASO 4b — Correcciones de validación, portal y suite E2E

## 1. Paso realizado y resultado

**Completo.**

Se corrigieron los 10 fallos reportados por el supervisor:

- El digest de `/portal` se debía a que `node:sqlite` entrega filas con prototipos no serializables. Las filas y estructuras ahora se convierten a objetos planos antes de pasarlas a componentes cliente.
- El Gestor CFE ya no expone `data_json` crudo; muestra únicamente campos formateados y truncados a 300 caracteres.
- Se añadió lista blanca de secciones/campos de `data_json`.
- Se añadió límite de 64 KB por cuerpo de petición.
- Se añadió límite de 300 caracteres por campo de texto.
- Se añadió `ValidationError` para que los errores de validación siempre sean HTTP 400.
- JSON malformado ahora responde 400.
- `nivelTension` y `tramite` se validan contra valores permitidos.
- `/api/auth/clear` rechaza rutas externas `//...` y `/\...`.
- Se agregó `gestor2.demo@example.invalid` para probar reasignaciones.
- Se integró `tests/e2e/supervisor-pasos-1-4.mjs` como `npm run test:e2e`.
- Se añadieron casos E2E para campos desconocidos, cuerpo grande, JSON malformado y ruta `"/\..."`.

Resultado final:

```text
66 ✅ / 0 ❌
```

## 2. Archivos creados/modificados

### Creados

- `lib/http.ts`
- `tests/e2e/supervisor-pasos-1-4.mjs`
- `docs/reportes/PASO_4b.md`

### Modificados

- `lib/data/expedientes.ts`
- `lib/db/seed.ts`
- `lib/http.ts`
- `app/portal/LocalPortal.tsx`
- `app/gestor-cfe/page.tsx`
- `app/api/expedientes/route.ts`
- `app/api/expedientes/[id]/route.ts`
- `app/api/auth/clear/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/coordinator/requests/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/notifications/route.ts`
- `package.json`

Script integrado:

```json
"test:e2e": "node tests/e2e/supervisor-pasos-1-4.mjs"
```

## 3. Comandos ejecutados y salida real

### Lint y TypeScript

```text
npm run lint

> eslint

Resultado: sin errores

npx tsc --noEmit

Resultado: sin errores
```

### Build local final

```text
APP_MODE=local
NEXT_PUBLIC_MODO=local
npm run build
```

Salida:

```text
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
ƒ /api/expedientes
ƒ /api/expedientes/[id]
ƒ /api/notifications
ƒ /gestor-cfe
ƒ /portal
ƒ Proxy (Middleware)
```

### Build demo y comprobación HTTP

```text
APP_MODE=demo
NEXT_PUBLIC_MODO=demo
npm run build

✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
```

Petición HTTP:

```text
home_status=200 home_has_conecta=True
portal_status=200 portal_has_mock_folio=True
```

### Base nueva e idempotencia

```text
LOCAL_DATA_DIR=<TEMP>\conecta-agil-paso4b-db
npm run db:migrate
npm run db:migrate
npm run db:seed
npm run db:seed
```

Salida:

```text
Migraciones aplicadas. schemaVersion=2
Migraciones aplicadas. schemaVersion=2
{
  "users": 5,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}
{
  "users": 5,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}
sqlite_exists=true
```

### Suite E2E completa

```text
npm run test:e2e
```

Salida completa:

```text
== P1/P2 health y modo
  ✅ health local + sqlite + schemaVersion>=2
  ✅ catálogo 28 requisitos
== P3 guardas sin sesión
  ✅ sin sesión /portal → redirect
  ✅ sin sesión /gestor → redirect
  ✅ sin sesión /gestor/proyectos → redirect
  ✅ sin sesión /gestor-cfe → redirect
  ✅ sin sesión /admin → redirect
  ✅ sin sesión /admin/usuarios → redirect
  ✅ sin sesión API /api/expedientes → 401/403
  ✅ sin sesión API /api/notifications → 401/403
  ✅ sin sesión API /api/admin/users → 401/403
  ✅ sin sesión API /api/coordinator/requests → 401/403
  ✅ POST sin Origin → 403
  ✅ POST con Origin ajeno → 403
== P3 registro/aprobación
  ✅ login coordinador
  ✅ login admin
  ✅ cliente A registrado+aprobado+login
  ✅ cliente B registrado+aprobado+login
  ✅ cookies httpOnly y sin Secure en http
  ✅ /portal de cliente sin expediente renderiza sin error
== P4 alta de expediente
  ✅ opciones: clientes A/B y ≥1 gestor
  ✅ alta A → 201 con folio IDC-AAAA-NNNN
  ✅ alta A: 11 requisitos R, 8 gates, G0 abierto
  ✅ folio secuencial (B = A+1)
  ✅ alta con cliente inexistente → 400
  ✅ alta con nivelTension inválido → 400
  ✅ cliente no puede crear expediente → 403
  ✅ JSON malformado → 400 (no 500)
== P4 aislamiento (IDOR)
  ✅ A solo ve sus expedientes
  ✅ A pide expediente de B → 404
  ✅ A intenta editar expediente de B → 404
  ✅ A /portal muestra su folio sin error de render
  ✅ cliente.demo /portal renderiza IDC-DEMO-0001 sin error
  ✅ /gestor-cfe (gestor) 200 sin error y < 1 MB
  ✅ /gestor (coordinador) 200 sin error y < 1 MB
  ✅ /gestor/proyectos (coordinador) 200 sin error y < 1 MB
  ✅ /admin/usuarios (seguridad) 200 sin error y < 1 MB
  ✅ admin GET /api/expedientes → 403
  ✅ admin GET /api/expedientes/:id → 403
== P4 gestor y reasignación
  ✅ login gestor (semilla)
  ✅ gestor1 ve expediente A
  ✅ gestor1 NO ve expediente B (sin asignar)
  ✅ gestor1 no puede editar datos → 403
  ✅ gestor1 no puede reasignar
  ✅ asignar cliente como gestor → 400
  ✅ reasignación → historial con 2 gestores, anterior con ends_at
  ✅ gestor1 pierde acceso tras reasignación
  ✅ gestor1 recibe notificación de reasignación
== P4 captura y validación
  ✅ captura válida → 200
  ✅ RFC inválido → 400
  ✅ capacidad 0 → 400
  ✅ RPU no numérico → 400
  ✅ falta RPU (RFC válido) → 400
  ✅ falta tipo_persona (RFC válido) → 400
  ✅ campos no permitidos → 400 y no se guardan
  ✅ payload enorme (2 MB) rechazado
  ✅ JSON malformado en captura → 400
== P4 notificaciones
  ✅ cliente A notificado del alta
  ✅ B no puede marcar notificación de A
  ✅ A marca su notificación como leída
== P3/P4 varios
  ✅ /api/auth/clear no redirige a dominio externo
  ✅ /api/auth/clear rechaza ruta /\ externa
  ✅ A bloqueado → API expedientes 401/403
  ✅ A desbloqueado → API 200
  ✅ logout A
  ✅ tras logout API → 401/403

RESULTADO: 66 ✅  /  0 ❌
```

### Limpieza final de la base local

```text
CONFIRM=1 npm run db:reset

Base SQLite local eliminada.

npm run db:migrate

Migraciones aplicadas. schemaVersion=2

npm run db:seed

{
  "users": 5,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}
```

Health final:

```json
{
  "modo": "local",
  "db": "sqlite",
  "ok": true,
  "schemaVersion": 2,
  "counts": {
    "users": 5,
    "account_requests": 0,
    "sessions": 0,
    "expedientes": 1,
    "expediente_assignments": 1,
    "requirement_catalog": 28,
    "expediente_requirements": 28,
    "documents": 0,
    "document_versions": 0,
    "observations": 0,
    "gates": 8,
    "external_events": 0,
    "notifications": 0,
    "audit_events": 0,
    "export_jobs": 0
  }
}
```

Portal de semilla:

```text
status=200 digest=False seed_folio=True
```

## 4. Cómo probarlo manualmente

Servidor final:

```text
http://localhost:3140
http://192.168.56.1:3140
```

Usuarios ficticios:

```text
cliente.demo@example.invalid / ConectaLocal-2026!
gestor.demo@example.invalid / ConectaLocal-2026!
gestor2.demo@example.invalid / ConectaLocal-2026!
coordinador.demo@example.invalid / ConectaLocal-2026!
seguridad.demo@example.invalid / ConectaLocal-2026!
```

Ejecutar:

```text
npm run test:e2e
```

La suite crea clientes y expedientes ficticios temporales para probar aislamiento, asignación, reasignación, validación, notificaciones y bloqueo.

## 5. Decisiones tomadas

- Se mantiene la semilla estrictamente ficticia.
- El límite de petición es 64 KB.
- Cada texto de `data_json` admite como máximo 300 caracteres.
- Las secciones permitidas son:
  - `solicitante`
  - `servicio_actual`
  - `central`
  - `contacto`
  - `representacion`
- Los campos desconocidos generan HTTP 400.
- Los trámites permitidos son:
  - `interconexion_fv_mt`
  - `aprobacion_proyecto_mt`
  - `contratacion_medidor`
- El portal cliente recibe objetos planos serializables.
- Gestor CFE recibe solo un resumen formateado, nunca el JSON completo.
- La base final quedó en el estado limpio de la semilla.

## 6. Preguntas o riesgos pendientes

- La suite todavía utiliza credenciales ficticias y una base local de pruebas, nunca datos reales.
- Los requisitos U01–U17 siguen sujetos a confirmar por trámite y por oficio CFE/CENACE, conforme a la pregunta documentada en el PASO 4.
- Los campos adicionales de domicilio o representación deberán agregarse únicamente cuando IDC confirme sus nombres oficiales.

## 7. Commit

Mensaje requerido:

```text
Paso 4b: correcciones de validación, portal y suite e2e
```

Trailer:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
