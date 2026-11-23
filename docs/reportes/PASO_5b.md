# PASO 5b — Administración de Gestores IDC

## 1. Alcance

El administrador de seguridad puede crear Gestores IDC sin un límite artificial de cupo, activar o bloquear sus cuentas y revocar sus sesiones. El valor persistido continúa siendo `coordinador_idc`; la interfaz lo presenta como “Gestor IDC”. El administrador no obtiene alcance sobre expedientes, `data_json` ni documentos.

## 2. Implementación

- `POST /api/admin/users` acepta `action: "create_gestor"` con nombre, correo y contraseña temporal.
- Se valida correo, nombre y contraseña de al menos 10 caracteres.
- El correo duplicado responde `409`.
- El alta se realiza en transacción, con estado `activo`, hash scrypt y auditoría `alta_gestor_idc`.
- La lista de administración incluye el nuevo usuario y su estado.
- El bloqueo, desbloqueo y revocación existentes siguen ejecutándose en transacción.
- El selector de Responsables IDC reutiliza los usuarios activos `coordinador_idc`, por lo que un Gestor recién creado puede recibir expedientes sin cambios de esquema.
- La UI local de `/admin/usuarios` permite crear y administrar Gestores IDC.

## 3. Validación estática

```text
npx tsc --noEmit
Código de salida: 0

npm run lint
> conecta-agil@0.1.0 lint
> eslint
Código de salida: 0
```

## 4. Regresión E2E aislada

```text
npm run test:e2e:isolated

Suite general:
RESULTADO: 85 ✅  /  0 ❌

Suite adversarial documental:
RESULTADO: 33 ✅ / 0 ❌
```

Casos nuevos de administración:

```text
✅ admin crea Gestor IDC sin límite de cupo
✅ Gestor IDC creado puede iniciar sesión
✅ Gestor IDC creado aparece en administración
✅ admin bloquea Gestor IDC y revoca su acceso
✅ admin desbloquea Gestor IDC
```

## 5. Build y smoke test demo

```text
npm run build
Build mode: demo
✓ Compiled successfully
✓ Running TypeScript
Código de salida: 0

Servidor demo:
demo health=200 root=200
```

## 6. Base local y build final

```text
CONFIRM=1 npm run db:reset
Base SQLite local eliminada.

npm run db:migrate
Migraciones aplicadas. schemaVersion=2

npm run db:seed
{
  "users": 4,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}

npm run build
Build mode: local
✓ Compiled successfully
✓ Running TypeScript
Código de salida: 0
```

La base principal quedó limpia y resembrada después de las pruebas aisladas. Los datos creados por E2E solo estuvieron en carpetas temporales.

## 7. Commit

```text
Pendiente de crear:
Paso 5b: administración de Gestores IDC
```
