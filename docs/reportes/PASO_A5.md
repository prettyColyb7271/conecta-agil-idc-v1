# Paso A5 · Kit de corrida, guion y capturas

Rama `paso-a5`, creada desde `desarrollo` en `69d3eec`. Validación: 27/11/2026. A5 implementado, pendiente de aprobación del supervisor; sin push ni merge.

## Alcance

- `demo:docs` genera 37 PDF válidos: uno para cada R01–R11 y U01–U17, y uno para cada uno de los nueve eventos externos. Todos llevan la marca **MUESTRA – DATOS FICTICIOS**; el directorio `demo-docs/` está ignorado.
- `demo:seed` requiere `APP_MODE=local`, un `LOCAL_DATA_DIR` explícito, aislado y vacío. Crea `IDC-DEMO-0001`, `Empresa Solar Ficticia S.A. de C.V.`, RFC ficticio `XAXX010101000`, 45.5 kW, dos Gestores IDC y un admin, además del cliente ficticio. Se niega a operar sobre la ruta real de ConectaAgil.
- `demo:snapshot save|restore <nombre>` copia una imagen consistente de SQLite y los archivos de demo. Acepta únicamente contenido conocido, nombres de snapshot seguros y una carpeta de datos separada de la base real. La restauración requiere detener la aplicación.
- La corrida completa en [corrida-ui-g0-g7.mjs](../../tests/e2e/corrida-ui-g0-g7.mjs) usa exclusivamente el `LOCAL_DATA_DIR` temporal, los PDF generados y `ZOHO_TRANSPORT=file`; recorre G0→G7, el reproceso CFE, el acuse nuevo y la recuperación del cliente.
- `zoho:limpiar-demo` consulta y elimina solo tareas Gate 1–Gate 8 con coincidencia exacta del folio indicado; exige confirmación. La suite usa exclusivamente un servidor HTTP local con credenciales ficticias.
- `capturas` usa `playwright-core` y el Edge instalado (`channel: "msedge"`), sin descargar navegador. Las imágenes se generan a 1366×768, excepto la captura 19 (el panel completo de la maqueta Zoho) y la captura móvil 20 (390×844); la captura 2 abre las preferencias en oscuro. La captura 4 se valida sin QR, URI MFA, clave ni códigos. Para no incluir la ubicación fija del encabezado en los archivos del reporte, el runner retira esa línea solo en el contexto de captura; no altera la UI de la aplicación.
- [CORRIDA_DEMO.md](../CORRIDA_DEMO.md) contiene el guion de 15 minutos, los roles, las acciones por Gate, el reproceso, la maqueta de Zoho, los snapshots y el plan B.
- [SEGURIDAD_ROTACION.md](../SEGURIDAD_ROTACION.md) documenta que la rotación de Zoho requiere borrar y recrear el Self Client, lo cual también cambia el Client ID; los tokens del cliente eliminado dejan de servir y el script no revoca el token anterior.

## Capturas del reporte

Todas son ficticias, se generan en `docs/reporte/capturas/` y se validan en el DOM antes de escribirse.

| # | Captura | Ruta |
|---:|---|---|
| 1 | Inicio de sesión | `docs/reporte/capturas/01-inicio-sesion.png` |
| 2 | Preferencias en modo oscuro | `docs/reporte/capturas/02-preferencias-modo-oscuro.png` |
| 3 | Solicitud de registro | `docs/reporte/capturas/03-solicitud-registro.png` |
| 4 | Seguridad/MFA sin QR | `docs/reporte/capturas/04-seguridad-mfa-sin-qr.png` |
| 5 | Portal: privacidad y captura | `docs/reporte/capturas/05-portal-privacidad-captura.png` |
| 6 | Portal: documentos con observación | `docs/reporte/capturas/06-portal-documentos-observacion.png` |
| 7 | Portal: avance Gate 5 | `docs/reporte/capturas/07-portal-avance-gate-5.png` |
| 8 | Formatos CFE y vista previa | `docs/reporte/capturas/08-formatos-cfe-vista-previa.png` |
| 9 | Inicio del Gestor IDC | `docs/reporte/capturas/09-gestor-inicio-indicadores.png` |
| 10 | Proyectos: alta y asignación | `docs/reporte/capturas/10-proyectos-alta-asignacion.png` |
| 11 | Revisión de requisitos | `docs/reporte/capturas/11-revision-validacion-requisitos.png` |
| 12 | Flujo de firma | `docs/reporte/capturas/12-revision-flujo-firma.png` |
| 13 | Registro del acuse CFE | `docs/reporte/capturas/13-revision-acuse-cfe.png` |
| 14 | Oficio y vigencia | `docs/reporte/capturas/14-revision-oficio-vigencia.png` |
| 15 | Inspección UIIE | `docs/reporte/capturas/15-revision-inspeccion-uiie.png` |
| 16 | Cierre por segundo Gestor | `docs/reporte/capturas/16-revision-cierre-gate-8.png` |
| 17 | Admin: cuentas | `docs/reporte/capturas/17-admin-cuentas.png` |
| 18 | Admin: bitácora | `docs/reporte/capturas/18-admin-bitacora.png` |
| 19 | Admin: Integraciones y maqueta Zoho | `docs/reporte/capturas/19-admin-integraciones-zoho.png` |
| 20 | Portal del Cliente en móvil | `docs/reporte/capturas/20-portal-cliente-movil.png` |
| 21 | Inicio de seguridad del admin | `docs/reporte/capturas/21-admin-inicio-seguridad.png` |
| 22 | Reproceso CFE y semáforo | `docs/reporte/capturas/22-reproceso-cfe-semaforo.png` |

## Commits

| Hash | Cambio |
|---|---|
| `f82373a` | Herramientas de datos ficticios, snapshots, limpieza Zoho y pruebas aisladas |
| `HASH_CAPTURAS` | Corrida automatizada, guion de 15 minutos, 22 capturas y reporte |

## Verificación aislada

Regla 2 completa en un worktree temporal tras `npm ci`, con `APP_MODE=local`, `ZOHO_TRANSPORT=file`, credenciales Zoho vacías y bases temporales. `.env.local` no estaba presente en la copia:

| Comando | Resultado |
|---|---|
| `npm ci` | ✅ Instalación limpia; 7 alertas moderadas de auditoría ya presentes en dependencias |
| `npm run lint` | ✅ Exit 0; una advertencia preexistente por `execFileSync` sin uso en `supervisor-a3.mjs` |
| `npx tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ |
| `npm run build` en modo local | ✅; se volvió a compilar en local tras la regresión antes de capturar |
| `npm run test:e2e:isolated` | ✅ **875 ✅ / 0 ❌**, 21 suites con conteo explícito; otros cuatro procesos terminaron con exit 0 sin conteo |
| `npm run capturas` | ✅ **254 ✅ / 0 ❌**; 22 PNG verificados y Edge `msedge` local |

Desglose de las suites con conteo explícito:

| Suite | ✅ | ❌ |
|---|---:|---:|
| `migration-010-with-data` | 4 | 0 |
| `supervisor-a0-runner` | 8 | 0 |
| `supervisor-pasos-1-4` | 94 | 0 |
| `supervisor-documentos` | 33 | 0 |
| `supervisor-paso6` | 13 | 0 |
| `supervisor-gestores` | 27 | 0 |
| `supervisor-flujo-g0-g2` | 37 | 0 |
| `supervisor-a1-firma-ui` | 18 | 0 |
| `supervisor-a3` | 12 | 0 |
| `supervisor-paso7` | 6 | 0 |
| `supervisor-flujo-g3-g7` | 68 | 0 |
| `corrida-ui-g0-g7` | 228 | 0 |
| `supervisor-seguridad-aislado` | 10 | 0 |
| `supervisor-seguridad-ataque` | 38 | 0 |
| `supervisor-origen-8d` | 36 | 0 |
| `supervisor-a4` | 126 | 0 |
| `supervisor-zoho-api` | 54 | 0 |
| `supervisor-mfa-rotacion` | 10 | 0 |
| `supervisor-a7-admin` | 38 | 0 |
| `supervisor-a5-demo` | 10 | 0 |
| `supervisor-a5-zoho` | 5 | 0 |
| **Total** | **875** | **0** |

`regresiones-pr1`, `migration-004-with-data`, `db-migrate` y `db-seed` terminaron con exit 0 sin conteo. `supervisor-a5-demo` verifica PDF, semilla, snapshots y rechazo de la ruta real; `supervisor-a5-zoho` prueba confirmación, coincidencia exacta por folio y credenciales ocultas únicamente contra `127.0.0.1`. `corrida-ui-g0-g7` verifica Gate 8 cerrado y el reproceso; `npm run capturas` valida las vistas y sus dimensiones. Se ajustó la aserción A3 para que el valor ilustrativo `4.5` no confunda la capacidad ficticia `45.5 kW`.

No se leyó, mostró ni modificó `.env.local`. Ninguna prueba llamó a Zoho real. No se ejecutó `db:seed` ni `demo:seed` contra la base real. La salida de `npm ci` señaló siete alertas moderadas; no se ejecutó `npm audit fix`.
