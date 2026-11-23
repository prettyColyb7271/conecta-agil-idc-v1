# PASO 4c — Gestor IDC como rol operativo único

## 1. Alcance

Se consolidó `coordinador_idc` como el rol operativo visible **Gestor IDC**. El valor `gestor_tramites_cfe` se conserva en tipos y restricciones de base de datos para evitar una migración destructiva, pero ya no se usa en la semilla, navegación, asignaciones ni acceso operativo.

## 2. Cambios principales

- Etiquetas de UI, menú y mensajes actualizadas a “Gestor IDC”.
- `/gestor-cfe` redirige a `/gestor`.
- La semilla crea:
  - `coordinador.demo@example.invalid`
  - `idc2.demo@example.invalid`
  - ambos con rol `coordinador_idc`.
- Se eliminaron de la semilla `gestor.demo@example.invalid` y `gestor2.demo@example.invalid`.
- El selector de alta/reasignación ofrece usuarios activos `coordinador_idc` como Responsables IDC.
- Todos los usuarios IDC pueden consultar todos los expedientes.
- Las asignaciones conservan historial, fechas, auditoría y notificaciones, usando `assignment_type = 'coordinador_idc'`.

## 3. Suite E2E

Se agregó:

```text
npm run test:e2e:isolated
```

La variante crea una base SQLite temporal, ejecuta migración y semilla, levanta un servidor en el puerto `3199`, ejecuta la suite y elimina el directorio temporal al terminar.

Salida real:

```text
Migraciones aplicadas. schemaVersion=2
{
  "users": 4,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}

RESULTADO: 66 ✅  /  0 ❌
```

La suite verifica asignación y reasignación entre Responsables IDC, historial, notificaciones, aislamiento de cliente, rechazo de asignación por cliente y redirección de `/gestor-cfe`.

## 4. Validación estática

```text
npm run lint
> conecta-agil@0.1.0 lint
> eslint
```

Código de salida: `0`.

```text
npx tsc --noEmit
```

Código de salida: `0`.

## 5. Build local

```text
npm run build
Build mode: local
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
```

El build terminó correctamente. Las rutas `/gestor`, `/gestor/proyectos` y `/gestor/usuarios` permanecen dinámicas.

## 6. Base de datos

La migración no modifica los CHECKs existentes. El rol histórico `gestor_tramites_cfe` permanece definido en el esquema, pero la semilla nueva contiene cuatro usuarios ficticios: un cliente, dos Gestores IDC y un administrador de seguridad.

## 7. Commit

Pendiente de crear en esta fase:

```text
Paso 4c: Gestor IDC como rol operativo único
```
