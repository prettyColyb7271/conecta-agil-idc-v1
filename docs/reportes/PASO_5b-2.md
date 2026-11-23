# PASO 5b-2 — Contraseña temporal, cambio obligatorio y pendientes

## 1. Implementación

- Se agregó `003_contrasena_temporal.sql` sin modificar `001_inicial.sql` ni `002_catalogo_y_registro.sql`.
- `users.must_change_password` es `INTEGER NOT NULL DEFAULT 0 CHECK (0, 1)`.
- El alta de Gestor IDC ya no acepta contraseña del administrador.
- El servidor genera una contraseña temporal criptográficamente aleatoria de 32 caracteres URL-safe, la devuelve una sola vez en la respuesta `201` y nunca la persiste en claro.
- La UI muestra la temporal con el aviso: “Cópiala ahora, no se volverá a mostrar”.
- El reset de contraseña:
  - genera una nueva temporal;
  - revoca todas las sesiones;
  - activa `must_change_password`;
  - registra únicamente el evento `reset_contrasena`, sin la contraseña.
- El cambio obligatorio requiere la contraseña actual y una nueva de al menos 12 caracteres, distinta de la actual.
- Al cambiar:
  - `must_change_password` pasa a `0`;
  - se revocan las demás sesiones;
  - se registra `cambio_contrasena`;
  - se elimina la cookie de control temporal.
- `getCurrentUser`/`requireRole` aplican la regla en servidor. Las APIs responden `403` con:

```json
{"error":"Debes cambiar tu contraseña"}
```

- El proxy redirige rutas protegidas a `/cambiar-contrasena` mientras exista la cookie de control.
- El administrador ve estado, último acceso y conteo de expedientes asignados, sin `data_json` ni documentos.
- Bloquear un Gestor IDC devuelve `unassignedCount` y notifica a los demás Gestores IDC activos.
- `/gestor` incorpora “Mis pendientes” con filtro `míos/todos`:
  - requisitos cargados/en revisión;
  - expedientes sin responsable activo;
  - requisitos observados en espera del cliente;
  - expedientes listos para cerrar G1.
- Se agregó el mapeo documental futuro en [docs/ZOHO_MAPEO.md](../ZOHO_MAPEO.md), sin conexión a Zoho.

## 2. Pruebas E2E

Se actualizaron las pruebas de creación para no enviar contraseña y se agregaron pruebas de:

```text
✅ alta sin password elegido por admin con temporal de ≥16 caracteres
✅ temporal ausente de GET de usuarios y audit_events
✅ login temporal limitado a /cambiar-contrasena
✅ API de expedientes bloqueada con 403
✅ contraseña corta → 400
✅ contraseña igual a la actual → 400
✅ cambio válido → acceso restaurado
✅ reset temporal y revocación de sesión previa
✅ cliente no puede crear Gestor IDC
✅ Gestor IDC no puede restablecer contraseña
✅ bloqueo de responsable devuelve conteo
✅ bloqueo notifica a otro Gestor IDC activo
✅ filtro “míos” respeta el responsable
```

Suite general:

```text
RESULTADO: 95 ✅  /  0 ❌
```

Suite documental:

```text
RESULTADO: 33 ✅ / 0 ❌
```

## 3. Validación estática

```text
npx tsc --noEmit
Código de salida: 0

npm run lint
> conecta-agil@0.1.0 lint
> eslint
Código de salida: 0
```

## 4. Build local

```text
npm run build
Build mode: local
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
Código de salida: 0
```

Rutas nuevas verificadas por el build:

```text
ƒ /api/auth/change-password
ƒ /api/gestor/pendientes
ƒ /cambiar-contrasena
```

## 5. Regresión demo

```text
npm run build
Build mode: demo
✓ Compiled successfully
Código de salida: 0

Servidor demo:
demo health=200 root=200
```

La demo no usa la base local ni el flujo de contraseñas temporales.

## 6. Base principal y servidor final

```text
CONFIRM=1 npm run db:reset
Base SQLite local eliminada.

npm run db:migrate
Migraciones aplicadas. schemaVersion=3

npm run db:seed
{
  "users": 4,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}
```

La base principal se dejó limpia y resembrada, sin datos de las pruebas E2E.

Health final esperado:

```json
{"modo":"local","db":"sqlite","ok":true,"schemaVersion":3}
```

El servidor local queda corriendo en `http://localhost:3140`.

## 7. Commits

```text
PASO 5b anterior:
f53f5f4f1b49ea66d662b1ecdc9fb301849f8880

PASO 5b-2:
8b00ad2ea6b71d03edfb043929b404bbc5c3fe7d
```
