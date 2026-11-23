# PASO 4 — Expedientes: alta, captura, asignación y reasignación

## 1. Paso realizado y resultado

**Completo.**

Se implementó el acceso autorizado a expedientes, alta por coordinador, folio secuencial, requisitos R01–R11, gates G0–G7, asignación/reasignación de Gestor CFE, captura de datos del cliente, vistas locales de cliente/coordinador/gestor, notificaciones y auditoría.

También se incluyeron los ajustes menores solicitados:

- Una solicitud rechazada ahora muestra: `Tu solicitud de cuenta no fue aprobada. Contacta a IDC.`
- Las cookies huérfanas se limpian mediante `/api/auth/clear` y al redirigir desde `proxy.ts` cuando falta la sesión.

## 2. Archivos creados/modificados

### Creados

- `lib/data/expedientes.ts`
- `app/api/auth/clear/route.ts`
- `app/api/expedientes/route.ts`
- `app/api/expedientes/[id]/route.ts`
- `app/api/notifications/route.ts`
- `app/portal/LocalPortal.tsx`
- `components/NotificationsBell.tsx`
- `docs/reportes/PASO_4.md`

### Modificados

- `lib/auth.ts`
- `app/api/auth/login/route.ts`
- `proxy.ts`
- `components/AltaProyecto.tsx`
- `components/AppShell.tsx`
- `app/portal/page.tsx`
- `app/gestor-cfe/page.tsx`

La demo continúa usando el flujo mock existente. Las nuevas consultas de expedientes pasan por `lib/data/expedientes.ts`, que aplica el alcance según el usuario actual.

## 3. Comandos ejecutados y resultado

### Lint y TypeScript

```text
npm run lint

Resultado: sin errores

npx tsc --noEmit

Resultado: sin errores
```

### Build local

```text
APP_MODE=local
NEXT_PUBLIC_MODO=local
npm run build
```

Salida relevante:

```text
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
```

Rutas principales:

```text
ƒ /api/expedientes
ƒ /api/expedientes/[id]
ƒ /api/notifications
ƒ /gestor
ƒ /gestor-cfe
ƒ /portal
ƒ Proxy (Middleware)
```

No se generó `health.body`.

### Build demo

```text
APP_MODE=demo
NEXT_PUBLIC_MODO=demo
npm run build
```

Resultado:

```text
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
```

Después se reconstruyó nuevamente en modo local para dejar el servidor solicitado ejecutándose.

### Health local final

```text
GET http://localhost:3140/api/health
```

Salida real:

```json
{
  "modo": "local",
  "db": "sqlite",
  "ok": true,
  "schemaVersion": 2,
  "counts": {
    "users": 10,
    "account_requests": 6,
    "sessions": 19,
    "expedientes": 2,
    "expediente_assignments": 4,
    "requirement_catalog": 28,
    "expediente_requirements": 39,
    "documents": 0,
    "document_versions": 0,
    "observations": 0,
    "gates": 16,
    "external_events": 0,
    "notifications": 3,
    "audit_events": 51,
    "export_jobs": 0
  }
}
```

Los conteos incluyen los datos ficticios creados durante la prueba manual del PASO 4.

### Pruebas HTTP reales

Coordinador autenticado:

```text
login={"role":"coordinador_idc","name":"Coordinador Demo Ficticio"}
```

Alta:

```json
{
  "folio": "IDC-2026-0001",
  "status": "borrador",
  "gates": [
    "G0: abierto",
    "G1: bloqueado",
    "G2: bloqueado",
    "G3: bloqueado",
    "G4: bloqueado",
    "G5: bloqueado",
    "G6: bloqueado",
    "G7: bloqueado"
  ],
  "requirements_created": 11,
  "assignment_history_entries": 3
}
```

Acceso de cliente a expediente de otro cliente:

```json
{
  "error": "Expediente no encontrado."
}
```

Validación de datos:

```json
{
  "error": "RFC inválido: debe tener 12 o 13 caracteres. RPU inválido: debe ser numérico. La capacidad_bruta_kw debe ser mayor que cero."
}
```

Acceso de administrador de seguridad:

```text
status=403
body={"error":"No autorizado."}
```

Portal sin sesión:

```text
HTTP/1.1 307 Temporary Redirect
location: /
set-cookie: conecta-role=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
contains_expediente=False
```

## 4. Cómo probarlo manualmente

Servidor local final:

```text
http://localhost:3140
http://192.168.56.1:3140
```

Usuarios ficticios:

```text
coordinador.demo@example.invalid / ConectaLocal-2026!
cliente.demo@example.invalid / ConectaLocal-2026!
gestor.demo@example.invalid / ConectaLocal-2026!
seguridad.demo@example.invalid / ConectaLocal-2026!
```

Flujo:

1. Entrar como coordinador en `/gestor/proyectos`.
2. Seleccionar cliente activo, trámite, tensión, habilitado y gestor.
3. Crear el expediente y confirmar folio, 11 requisitos R y 8 gates.
4. Reasignar el gestor desde la lista.
5. Confirmar el historial de asignaciones.
6. Entrar como cliente en `/portal` y revisar expediente, gates y requisitos.
7. Capturar RFC, RPU y capacidad.
8. Probar valores inválidos y confirmar respuesta HTTP 400.
9. Entrar como Gestor CFE en `/gestor-cfe` y confirmar que solo aparecen expedientes asignados vigentes.
10. Entrar como administrador y confirmar HTTP 403 en `/api/expedientes`.

## 5. Decisiones tomadas

- La autorización se centraliza en `lib/data/expedientes.ts`.
- Cliente: filtra por `cliente_id`.
- Gestor CFE: filtra por asignación vigente sin `ends_at`.
- Coordinador: puede consultar todos.
- Administrador de seguridad: no puede consultar expedientes.
- Los datos capturados se guardan en `data_json`.
- Se validan RFC de 12/13 caracteres, RPU numérico y capacidad positiva.
- La edición se bloquea cuando G1 está cerrado.
- Para un alta nueva se crean R01–R11. La especificación no define todavía de forma inequívoca qué requisitos U01–U17 entran desde el alta inicial; quedan documentados para la fase de UIIE/G6.
- La auditoría registra nombres de campos modificados, nunca valores sensibles.
- Las reasignaciones cierran la asignación anterior y generan una nueva.
- Las notificaciones se crean para el cliente al alta y para los gestores al asignar/reasignar.

## 6. Preguntas o riesgos pendientes

- Confirmar con IDC el momento exacto en que U01–U17 deben agregarse al expediente según el trámite y el oficio CFE/CENACE.
- Confirmar si el catálogo debe permitir trámites distintos de `interconexion_fv_mt` en el piloto.
- La UI de notificaciones ya lista datos reales y muestra contador; el marcado individual está disponible mediante `PATCH /api/notifications`, pero puede recibir una interacción visual más específica en una iteración posterior.
- Los datos de prueba actuales incluyen expedientes y usuarios adicionales creados durante la validación; no son datos reales.

## 7. Commit

El commit se crea al finalizar la validación del paso con el mensaje:

```text
Paso 4: expedientes, captura, asignación y reasignación
```

Incluye:

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
