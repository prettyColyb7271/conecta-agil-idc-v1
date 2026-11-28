# Paso A7 · Interfaz administrativa

Rama `paso-a7`, creada desde `desarrollo` (`c5c4124`). A7 queda en revisión del supervisor (🟡); no hubo push ni merge y `main` no se modificó. No se cambiaron reglas de negocio, permisos ni esquema de base de datos.

## Implementación

- **Inicio (`/admin`):** tablero de metadatos reales en modo local: cuentas por rol y estado, MFA, actividad de las últimas 24 horas, integraciones y alertas. En modo demo muestra datos ficticios con la marca “Ejemplo”. No presenta contenido del expediente ni datos del cliente. Ver [page.tsx](../../app/admin/page.tsx), [AdminInicio.tsx](../../components/AdminInicio.tsx) y [dashboard.ts](../../lib/admin/dashboard.ts).
- **Accesos:** fechas `dd/mm/aaaa hh:mm`, etiquetas en español con el código interno como tooltip, metadata por allowlist, filtros por fechas/usuario/evento, páginas de 50 y CSV sanitizado. Los correos intentados en logins fallidos no se muestran. Ver [AccessLog.tsx](../../components/AccessLog.tsx), [route.ts](../../app/api/admin/access/route.ts) y [access-log.ts](../../lib/admin/access-log.ts).
- **Cuentas:** en modo local consulta la API y muestra “Cargando cuentas”; no utiliza nombres de usuarios de `data/mock.ts`. La vista demo conserva ejemplos marcados. Ver [AdminUsuarios.tsx](../../components/AdminUsuarios.tsx) y las páginas [admin](../../app/admin/usuarios/page.tsx) / [Gestor IDC](../../app/gestor/usuarios/page.tsx).
- **Seguridad:** OneAuth, MFA y códigos de respaldo usan paneles compartidos; la lógica de MFA se conserva y el aviso “No proyectes esta pantalla…” es visible. La demo no consulta SQLite ni muestra QR, secretos o códigos. Ver [MfaSetup.tsx](../../components/MfaSetup.tsx) y [page.tsx](../../app/seguridad/page.tsx).
- **Integraciones:** usa los mismos paneles e insignias del resto de administración; mantiene pendientes, enviados, fallidos y la maqueta “Así se vería en Zoho Projects”, con la nota de sincronización unidireccional. El transporte y la lógica de la outbox no cambiaron. Ver [IntegrationsPanel.tsx](../../app/admin/integraciones/IntegrationsPanel.tsx).
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

La suite [supervisor-a7-admin.mjs](../../tests/e2e/supervisor-a7-admin.mjs) cubre el tablero contra la BD, carga local de Cuentas, las cinco pantallas, sanitización de metadata/CSV, filtros y paginación, privacidad de datos, permisos 403/redirecciones y el modo demo sin SQLite ni llamadas externas. La suite de seguridad verifica que un login fallido figure en la bitácora sin exponer el correo intentado.

## Regla 2 y verificación visual

La regla 2 se ejecutó en la copia aislada `paso-a7-validation`, preparada con `npm ci`; Zoho se forzó a `file` y las credenciales externas de prueba quedaron vacías.

| Verificación | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ 5 plantillas DOCX y F-01 PDF |
| `npm run build` en modo local | ✅ |
| `npm run test:e2e:isolated` | ✅ 18 suites con conteo: **840 ✅ / 0 ❌** |
| `supervisor-a7-admin.mjs` | ✅ **24 ✅ / 0 ❌** |
| `supervisor-seguridad-ataque.mjs` | ✅ **36 ✅ / 0 ❌** |
| `corrida-ui-g0-g7.mjs` | ✅ **228 ✅ / 0 ❌** |
| `supervisor-a4.mjs` / `supervisor-zoho-api.mjs` | ✅ **126 / 54**, solo con archivo y simulador loopback |

Las 18 suites contadas son `supervisor-a0-runner` (8), `supervisor-pasos-1-4` (94), `supervisor-documentos` (33), `supervisor-paso6` (13), `supervisor-gestores` (27), `supervisor-flujo-g0-g2` (37), `supervisor-a1-firma-ui` (18), `supervisor-a3` (12), `supervisor-paso7` (6), `supervisor-flujo-g3-g7` (68), `corrida-ui-g0-g7` (228), `supervisor-seguridad-aislado` (10), `supervisor-seguridad-ataque` (36), `supervisor-origen-8d` (36), `supervisor-a4` (126), `supervisor-zoho-api` (54), `supervisor-mfa-rotacion` (10) y `supervisor-a7-admin` (24). Los cuatro comandos auxiliares de migración/arranque terminaron con exit 0.

Se revisaron las cinco capturas de modo demo a 1366×768. La de Seguridad no muestra QR, clave ni códigos. Las cinco rutas también se comprobaron a 390×844: sin scroll horizontal de página; las tablas anchas quedan contenidas en su área desplazable.

## Capturas ficticias

- [Inicio administrativo](img/a7-admin-inicio.png)
- [Bitácora de accesos](img/a7-admin-accesos.png)
- [Cuentas](img/a7-admin-cuentas.png)
- [Integraciones y maqueta Zoho](img/a7-admin-integraciones.png)
- [Seguridad, sin QR ni secretos](img/a7-admin-seguridad.png)

Las imágenes se tomaron con el perfil demo y datos ficticios; no muestran datos de la base real.

## Servidor local

En OneDrive se ejecutó `npm run build` en modo local y `npm run db:migrate`, sin `db:seed`; la migración dejó `schemaVersion=9`. Después se inició con `npm run start:local`. `/api/health` respondió HTTP 200 con `modo=local`, `ok=true` y `schemaVersion=9`.

`.env.local` no se leyó ni modificó manualmente. Las regresiones y capturas no llamaron a Zoho real; el transporte de prueba fue `file`. No se hizo push ni merge.
