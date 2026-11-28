# Paso A7 · Interfaz administrativa

Rama `paso-a7`, creada desde `desarrollo` (`c5c4124`). A7 queda en revisión del supervisor (🟡); no hubo push ni merge y `main` no se modificó. No se cambiaron reglas de negocio ni permisos; A7c solo transforma metadata histórica y eleva `schemaVersion` a 10.

## Implementación

- **Inicio (`/admin`):** tablero de metadatos reales en modo local: cuentas por rol y estado, MFA, actividad de las últimas 24 horas, integraciones y alertas. En modo demo muestra datos ficticios con la marca “Ejemplo”. No presenta contenido del expediente ni datos del cliente. Ver [page.tsx](../../app/admin/page.tsx), [AdminInicio.tsx](../../components/AdminInicio.tsx) y [dashboard.ts](../../lib/admin/dashboard.ts).
- **Accesos:** fechas `dd/mm/aaaa hh:mm` en `America/Hermosillo`, etiquetas en español con el código interno como tooltip, metadata por allowlist, filtros por fechas/usuario/evento, páginas de 50 y CSV sanitizado. Los correos de cuentas inexistentes se muestran enmascarados y las IP truncadas; nunca se muestra `user-agent`. Ver [AccessLog.tsx](../../components/AccessLog.tsx), [route.ts](../../app/api/admin/access/route.ts), [access-log.ts](../../lib/admin/access-log.ts) y [audit-privacy.ts](../../lib/audit-privacy.ts).
- **Cuentas:** en modo local consulta la API y muestra “Cargando cuentas”; no utiliza nombres de usuarios de `data/mock.ts`. La vista demo conserva ejemplos marcados. Ver [AdminUsuarios.tsx](../../components/AdminUsuarios.tsx) y las páginas [admin](../../app/admin/usuarios/page.tsx) / [Gestor IDC](../../app/gestor/usuarios/page.tsx).
- **Seguridad:** `/seguridad` usa [AppShell](../../components/AppShell.tsx) en modo local y demo. Si el administrador debe vincular MFA, el menú queda desactivado y “Cerrar Sesión” sigue disponible; las guardas del servidor no cambiaron. La demo no consulta SQLite ni muestra QR, secretos o códigos. Ver [MfaSetup.tsx](../../components/MfaSetup.tsx) y [page.tsx](../../app/seguridad/page.tsx).
- **Integraciones:** mantiene pendientes, enviados, fallidos y la maqueta “Así se vería en Zoho Projects”; las fechas visibles usan `dd/mm/aaaa`. El transporte y la lógica de la outbox no cambiaron. Ver [IntegrationsPanel.tsx](../../app/admin/integraciones/IntegrationsPanel.tsx) y [fechas.ts](../../lib/fechas.ts).
- La documentación explica la minimización de la bitácora, la migración histórica 010 y el costo aceptado de no poder bloquear una IP exacta desde la bitácora. Ver [SEGURIDAD_ROTACION.md](../SEGURIDAD_ROTACION.md).
- La documentación de rotación aclara que la herramienta no revoca el refresh token anterior y que revocarlo puede invalidar también el nuevo del mismo Self Client; la instrucción vigente es regenerar el Client Secret. Ver [SEGURIDAD_ROTACION.md](../SEGURIDAD_ROTACION.md).

## Commits por pantalla y regresión

| Commit | Cambio |
|---|---|
| `31e1b13` | Tablero administrativo y componentes compartidos |
| `ad4e8bd` | Bitácora administrativa con filtros y metadatos seguros |
| `9a4b27b` | Cuentas locales sin datos mock |
| `5869ca8` | Pantalla de Seguridad y nota de rotación Zoho |
| `c03f9e2` | Estilo de Integraciones |
| `94408bc` | Suite de regresión A7 e integración en `isolated.mjs` |

La suite [supervisor-a7-admin.mjs](../../tests/e2e/supervisor-a7-admin.mjs) cubre el tablero contra la BD, carga local de Cuentas, las cinco pantallas, sanitización de metadata/CSV, filtros y paginación, privacidad de datos, permisos 403/redirecciones y el modo demo sin SQLite ni llamadas externas. La suite de seguridad verifica el correo enmascarado, IP truncada y ausencia de `user-agent`.

## A7b · Ajustes de revisión

Se añadió el marco común de Seguridad y el menú desactivado mientras falta MFA; la bitácora presenta intentos de cuentas inexistentes con correo enmascarado, IP truncada y etiqueta “Cuenta inexistente”, y protege también los registros históricos y el CSV. Las fechas y filtros de Accesos usan `America/Hermosillo`. Inicio demo ya no incluye el rol histórico inactivo y los datos de MFA son coherentes; Integraciones presenta el año con cuatro dígitos. No cambiaron permisos del servidor ni reglas de negocio.

Commits de código A7b: `df23871` (Seguridad y MFA pendiente), `75db304` (privacidad de auditoría y hora de Hermosillo), `ccf31bb` (datos demo y fechas de Integraciones).

La captura de Seguridad se volvió a tomar en modo demo a 1366×768 con AppShell y sin QR ni clave. Ver [a7-admin-seguridad.png](img/a7-admin-seguridad.png).

## A7c · Minimización histórica de la bitácora

La decisión de privacidad se mantiene: las cuentas asociadas no conservan correo en metadata; los intentos sin cuenta conservan el correo enmascarado; las IP se truncan y el `user-agent` se elimina. La migración 010 usa `maskEmail` y `truncateIp`, modifica solo `metadata_json` y deja intactos el resto de columnas y eventos. No guardar la IP completa implica que no puede bloquearse desde la bitácora; ese control corresponde al firewall o proxy.

Commit de implementación A7c: `f6ade30`. La regresión aislada cubre eventos históricos con y sin `actor_id`, repetición de `db:migrate`, conservación de columnas/eventos y migración sobre una base ficticia con todas las tablas pobladas. `migration-010-with-data` pasó 4/0 y `supervisor-a7-admin` pasó 38/0. En la base local, la migración minimizó **28 filas**; el reporte registra solo el conteo, nunca su contenido.

## Regla 2 y verificación visual · A7b/A7c

La regla 2 de A7b se ejecutó en la copia aislada `paso-a7b-validation`, preparada con `npm ci`. Para A7c se usó `paso-a7c-validation`, también con `npm ci`; el worktree no recibió `.env.local`, Zoho se forzó a `file` y las credenciales externas de prueba quedaron vacías.

| Verificación | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ 5 plantillas DOCX y F-01 PDF |
| `npm run build` en modo local | ✅ |
| `npm run test:e2e:isolated` | ✅ 19 suites con conteo: **860 ✅ / 0 ❌** |
| `migration-010-with-data.mjs` | ✅ **4 ✅ / 0 ❌**; datos en todas las tablas |
| `supervisor-a7-admin.mjs` | ✅ **38 ✅ / 0 ❌** |
| `supervisor-seguridad-ataque.mjs` | ✅ **38 ✅ / 0 ❌** |
| `corrida-ui-g0-g7.mjs` | ✅ **228 ✅ / 0 ❌** |
| `supervisor-a4.mjs` / `supervisor-zoho-api.mjs` | ✅ **126 / 54**, solo con archivo y simulador loopback |

Las 19 suites contadas son `migration-010-with-data` (4), `supervisor-a0-runner` (8), `supervisor-pasos-1-4` (94), `supervisor-documentos` (33), `supervisor-paso6` (13), `supervisor-gestores` (27), `supervisor-flujo-g0-g2` (37), `supervisor-a1-firma-ui` (18), `supervisor-a3` (12), `supervisor-paso7` (6), `supervisor-flujo-g3-g7` (68), `corrida-ui-g0-g7` (228), `supervisor-seguridad-aislado` (10), `supervisor-seguridad-ataque` (38), `supervisor-origen-8d` (36), `supervisor-a4` (126), `supervisor-zoho-api` (54), `supervisor-mfa-rotacion` (10) y `supervisor-a7-admin` (38). `regresiones-pr1`, `migration-004-with-data`, `db-migrate` y `db-seed` terminaron con exit 0 sin conteo propio.

Se revisaron las cinco capturas de modo demo a 1366×768. La de Seguridad no muestra QR, clave ni códigos. Las cinco rutas también se comprobaron a 390×844: sin scroll horizontal de página; las tablas anchas quedan contenidas en su área desplazable.

## Capturas ficticias

- [Inicio administrativo](img/a7-admin-inicio.png)
- [Bitácora de accesos](img/a7-admin-accesos.png)
- [Cuentas](img/a7-admin-cuentas.png)
- [Integraciones y maqueta Zoho](img/a7-admin-integraciones.png)
- [Seguridad, sin QR ni secretos](img/a7-admin-seguridad.png)

Las imágenes se tomaron con el perfil demo y datos ficticios; no muestran datos de la base real.

## Servidor local

En OneDrive se ejecutó `npm run build` en modo local y `npm run db:migrate`, sin `db:seed`; la migración minimizó 28 filas y dejó `schemaVersion=10`. Después se inició con `npm run start:local`. `/api/health` respondió HTTP 200 con `modo=local`, `ok=true` y `schemaVersion=10`.

`.env.local` no se leyó ni modificó manualmente. Las regresiones y capturas no llamaron a Zoho real; el transporte de prueba fue `file`. No se hizo push ni merge.
