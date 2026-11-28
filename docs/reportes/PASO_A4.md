# Paso A4 · Zoho en modo archivo

Rama `paso-a4`, creada desde `desarrollo` en `3554d68`. Estado al 27/11/2026: implementación y regresión completas; pendiente de aprobación del supervisor. No hubo push ni merge.

## Alcance implementado

- La migración `009_outbox.sql` crea la outbox y eleva `schemaVersion` a 9. La escritura de la outbox participa en la transacción de cada evento de negocio, incluido `cfe_incompleto`; si falla la transacción no queda el evento ni su notificación. Ver [009_outbox.sql](../../lib/db/migrations/009_outbox.sql), [outbox.ts](../../lib/zoho/outbox.ts) y [gates.ts](../../lib/data/gates.ts).
- El snapshot de cada evento contiene el folio, el responsable, los ocho Gates, estados, fechas y subtareas seguras (códigos de requisitos y etiquetas genéricas de eventos). El reproceso reabre Gate 2 y marca como observados los requisitos elegidos, sin exportar retroalimentación ni notas internas. Ver [outbox.ts](../../lib/zoho/outbox.ts) y [supervisor-a4.mjs](../../tests/e2e/supervisor-a4.mjs).
- `ZOHO_TRANSPORT=file` es el transporte predeterminado. Cada envío escribe un JSON en `LOCAL_DATA_DIR/zoho-outbox/`. Un fallo del transporte queda como `fallido` y no revierte el evento del expediente; Reintentar guarda el identificador de envío y no duplica un envío ya completado. Ver [adapter.ts](../../lib/zoho/adapter.ts) y [outbox.ts](../../lib/zoho/outbox.ts).
- La pantalla admin **Integraciones** muestra pendientes, enviados y fallidos con Reintentar, y una maqueta de Zoho Projects con ocho tareas (Gate 1–Gate 8) y sus subtareas, derivada exclusivamente de la outbox. Gestores y clientes reciben 403 en la API de administración. Ver [IntegrationsPanel.tsx](../../app/admin/integraciones/IntegrationsPanel.tsx), [route.ts](../../app/api/admin/integraciones/route.ts) y [supervisor-a4.mjs](../../tests/e2e/supervisor-a4.mjs).
- Los payloads y la vista no incluyen RFC, INE, archivos, contenido documental, retroalimentación de CFE ni notas internas. La suite usa valores secretos ficticios para comprobar que no aparecen en los JSON ni en la respuesta admin.
- Se programó el transporte `api` con OAuth de refresh token y variables de configuración vacías en [.env.example](../../.env.example). No se conectó ni probó contra Zoho: no hay credenciales. Para la presentación se eligió el plan gratuito y el modo archivo; los documentos nunca se envían a Zoho.

## Commits

| Commit | Cambio |
|---|---|
| `563a368` | Outbox transaccional, transporte Zoho y migración |
| `4f3958b47035852f776feec60be88f7384209f88` | Pantalla admin, maqueta y regresión A4 |
| `b6b267d` | A4b: usar `id_string` de Zoho y probar el transporte API únicamente con el simulador local |
| `52c739e` | A4c: caché OAuth, cola por expediente, consolidación, actualizaciones selectivas y recuperación de envíos atorados |

## Verificación aislada

La regla 2 se ejecutó en una copia de validación limpia (`paso-a4-validation`) después de `npm ci`, con modo local y datos ficticios.

| Verificación | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ |
| `npm run build` en modo local | ✅ |
| `npm run test:e2e:isolated` | ✅ 15 suites con conteo explícito: **745 ✅ / 0 ❌**; 4 procesos adicionales terminaron sin publicar conteo |
| `supervisor-a4.mjs` | ✅ **119 ✅ / 0 ❌** |
| `corrida-ui-g0-g7.mjs` | ✅ **228 ✅ / 0 ❌**, flujo completo G0→G7 |
| `supervisor-origen-8d.mjs` | ✅ **36 ✅ / 0 ❌**, recuperación del cliente sigue cubierta |
| Migración con datos existentes | ✅ `migration-004-with-data` y `db:migrate` terminaron correctamente; A4 verifica además `schemaVersion=9` |

Desglose de las 15 suites que imprimieron conteo:

| Suite | ✅ | ❌ |
|---|---:|---:|
| `supervisor-a0-runner` | 8 | 0 |
| `supervisor-pasos` | 94 | 0 |
| `supervisor-docs` | 33 | 0 |
| `supervisor-paso6` | 13 | 0 |
| `supervisor-gestores` | 27 | 0 |
| `supervisor-g0-g2` | 37 | 0 |
| `supervisor-a1` | 18 | 0 |
| `supervisor-a3` | 12 | 0 |
| `supervisor-paso7` | 6 | 0 |
| `supervisor-g3-g7` | 68 | 0 |
| `corrida-ui-g0-g7` | 228 | 0 |
| `supervisor-seguridad-aislada` | 10 | 0 |
| `supervisor-seguridad-ataque` | 36 | 0 |
| `supervisor-origen-8d` | 36 | 0 |
| `supervisor-a4` | 119 | 0 |
| **Total** | **745** | **0** |

`supervisor-a4.mjs` comprueba la secuencia G0→G7 en modo archivo, ocho tareas y subtareas, creación de JSON, exclusión de datos sensibles, reproceso CFE y atomicidad ante fallo, permisos 403, reintento sin duplicados y migración a versión 9 sobre datos existentes. `regresiones-pr1`, `migration-004-with-data`, `db-migrate` y `db-seed` también finalizaron correctamente dentro del entorno aislado; no se sembró la base de OneDrive.

La instalación notificó siete vulnerabilidades moderadas en el árbol de dependencias. No se modificaron dependencias ni se ejecutó `npm audit fix`.

## A4b · ID exacto y simulador local

Zoho Projects puede devolver el ID como número JSON de 19 dígitos, que JavaScript redondea. `responseTaskId()` ahora prioriza `id_string` y solo admite `id` si es una cadena de dígitos o un entero seguro. Se agregaron overrides de URL vacíos en `.env.example` para que las pruebas del transporte API apunten al simulador HTTP local; el transporte predeterminado sigue siendo `file`. Ver [adapter.ts](../../lib/zoho/adapter.ts), [.env.example](../../.env.example) y [supervisor-zoho-api.mjs](../../tests/e2e/supervisor-zoho-api.mjs).

La regla 2 se ejecutó en una copia aislada tras `npm ci`: lint, TypeScript, revisión de plantillas y build local pasaron. `npm run test:e2e:isolated` terminó con 16 suites que reportaron conteo: **764 ✅ / 0 ❌**; cuatro procesos adicionales terminaron sin publicar conteo. `supervisor-zoho-api.mjs`: **19 ✅ / 0 ❌**. Probó IDs exactos, actualizaciones sin duplicar, respuesta numérica insegura y recuperación mediante Reintentar. Todo el tráfico API de prueba se dirigió a `127.0.0.1`; no se llamó a Zoho real.

Commit: `b6b267d` (`A4b: usar id_string de Zoho y simulador del transporte api`).

## A4c · caché, cola y actualizaciones selectivas

El transporte API reutiliza en memoria el access token hasta su vencimiento (restando 60 segundos; 50 minutos si OAuth no devuelve `expires_in`) y renueva una sola vez cuando Projects responde 401. Una cola serializa los envíos por expediente y procesa los snapshots en orden; en modo API consolida pendientes al snapshot más nuevo, conserva los IDs conocidos y solo crea o actualiza Gates que cambiaron. HTTP 429 deja el error «Zoho limitó las peticiones; usa Reintentar en unos minutos.». Reintentar admite fallidos, pendientes con más de un minuto y envíos con más de dos minutos en estado `enviando`. La vista Integraciones muestra cuándo un evento quedó consolidado. Ver [adapter.ts](../../lib/zoho/adapter.ts), [outbox.ts](../../lib/zoho/outbox.ts), [IntegrationsPanel.tsx](../../app/admin/integraciones/IntegrationsPanel.tsx) y [supervisor-zoho-api.mjs](../../tests/e2e/supervisor-zoho-api.mjs).

La regla 2 se volvió a ejecutar desde una copia aislada limpia (`C:\a4cv`) tras `npm ci`: lint, TypeScript, revisión de plantillas y build local pasaron. La regresión final (`npm run test:e2e:isolated`) terminó con 16 suites con conteo: **784 ✅ / 0 ❌**; los cuatro procesos restantes terminaron con exit 0 sin conteo. `supervisor-zoho-api.mjs`: **39 ✅ / 0 ❌**. La suite cubre una ráfaga de 11 validaciones, ocho tareas únicas y máximo un token, igualdad con el snapshot final, consolidación visible, actualización de un solo Gate, renovación 401, 429 y reintento sin duplicados, así como rescate de filas `enviando` y `pendiente` antiguas. `supervisor-a4.mjs` mantiene **119 ✅ / 0 ❌** en modo archivo. `schemaVersion` continúa en 9; no fue necesaria una migración.

Las URLs del simulador se verifican antes de iniciar la app y solo aceptan loopback; no se usaron credenciales reales ni se llamó a Zoho. `ZOHO_TRANSPORT=file` y `.env.local` no se modificaron. Commit: `52c739e` (`A4c: token en caché, cola por expediente y envíos solo de cambios`).

## Capturas ficticias

- [Integraciones: pendientes, enviados, fallidos y Reintentar](img/a4-integraciones.png)
- [Maqueta “Así se vería en Zoho Projects”](img/a4-maqueta-zoho.png)

Las imágenes contienen únicamente folios, responsables, fechas y estados ficticios; no son capturas de una cuenta Zoho real.

## Servidor local

Después de A4c se detuvo el proceso anterior de :3140, se compiló la copia de OneDrive en modo local con `npm run build`, se ejecutó `npm run db:migrate` (sin seed; `schemaVersion=9`) y se inició con `npm run start:local`. `http://localhost:3140/api/health` respondió HTTP 200, `modo=local` y `schemaVersion=9`; el servidor quedó activo con el código de `52c739e`.

## A4d · Reintentos sin regresar ni duplicar tareas

El commit `ade03d8` corrige los reintentos antiguos del transporte API. `sendToApi` combina los IDs de Gates guardados en todas las filas del expediente, dando precedencia al más reciente por Gate y completando con los IDs de la fila actual. Antes de enviar, la cola elige la fila no consolidada más nueva: si ya se envió, consolida las pendientes antiguas sin llamar a Zoho; si está pendiente, fallida o atorada, envía ese snapshot más nuevo. Las filas antiguas solo se marcan consolidadas después de que ese envío termine correctamente. Ver [adapter.ts](../../lib/zoho/adapter.ts) y [supervisor-zoho-api.mjs](../../tests/e2e/supervisor-zoho-api.mjs).

La suite dirigida `supervisor-zoho-api.mjs` terminó con **54 ✅ / 0 ❌**. Comprueba el fallo parcial tras crear Gates 1–3 y el reintento de A después de enviar B sin llamadas ni duplicados; el fallo sin IDs; y el caso en que el envío más nuevo falla con 429 y luego se recupera sin consolidar antes de tiempo. También se corrigió el caso de regresión de un pendiente antiguo para probarlo en un expediente aislado.

La Regla 2 completa se ejecutó en `C:\a4dv`, una copia aislada con dependencias instaladas mediante `npm ci`: lint, TypeScript, revisión de plantillas y build local pasaron. `npm run test:e2e:isolated` terminó con **799 ✅ / 0 ❌** en las 16 suites que publicaron conteo; cuatro procesos adicionales (`regresiones-pr1`, `migration-004-with-data`, `db-migrate` y `db-seed`) terminaron con exit 0 sin conteo. En particular, `supervisor-a4.mjs` conservó **119 ✅ / 0 ❌** y `supervisor-zoho-api.mjs` obtuvo **54 ✅ / 0 ❌**. El simulador API fue exclusivamente local; no se usó la cuenta real ni se cambió `ZOHO_TRANSPORT=file` o `.env.local`.

Tras el commit `ade03d8`, se reconstruyó la aplicación de OneDrive, `npm run db:migrate` confirmó `schemaVersion=9` (sin ejecutar `db:seed`) y `npm run start:local` quedó activo en :3140. `/api/health` respondió HTTP 200 con `modo=local` y `schemaVersion=9`. A4d sigue pendiente de aprobación; no hubo push ni merge.

## A4e · Integraciones tolera folios de semilla y registros ilegibles

El commit `4a0292e` amplía el formato de folio aceptado a `IDC-AAAA-NNNN` y `IDC-DEMO-NNNN`; la semilla vigente en [seed.ts](../../lib/db/seed.ts) usa `IDC-DEMO-0001`, y el patrón admite futuros folios demo con la misma convención. Si una fila no se puede interpretar, el dashboard devuelve `snapshot: null`, omite el error interno y deshabilita su reintento. La pantalla muestra únicamente “Registro no legible”, el estado y la fecha; no incluye el payload ni el error crudo, y excluye la fila inválida de la maqueta. Si falla la consulta completa, la página muestra “No fue posible consultar las integraciones”. Ver [outbox.ts](../../lib/zoho/outbox.ts), [IntegrationsPanel.tsx](../../app/admin/integraciones/IntegrationsPanel.tsx), [page.tsx](../../app/admin/integraciones/page.tsx) y [supervisor-a4.mjs](../../tests/e2e/supervisor-a4.mjs).

La suite dirigida `supervisor-a4.mjs` terminó con **126 ✅ / 0 ❌**. Comprueba que un evento real del flujo de prueba en `IDC-DEMO-0001` aparece en la página y en la maqueta; que una fila con JSON inválido no interrumpe la página ni GET `/api/admin/integraciones`, aparece sin contenido y conserva visibles las filas válidas; y que un fallo total del dashboard se representa con el mensaje claro.

La Regla 2 completa se ejecutó en `C:\a4ev`, una copia aislada tras `npm ci`: lint, TypeScript, revisión de plantillas y build local pasaron. `npm run test:e2e:isolated` terminó con **806 ✅ / 0 ❌** en las 16 suites con conteo; cuatro procesos adicionales (`regresiones-pr1`, `migration-004-with-data`, `db-migrate` y `db-seed`) terminaron con exit 0 sin conteo. `supervisor-a4.mjs`: **126 ✅ / 0 ❌**; `supervisor-zoho-api.mjs`: **54 ✅ / 0 ❌**. La prueba API de Zoho usó solo el simulador local.

El folio de semilla se confirmó en `lib/db/seed.ts`; la base real de OneDrive no se sembró ni se alteró para las pruebas. Después del commit A4e se compiló OneDrive, `npm run db:migrate` confirmó `schemaVersion=9` (sin `db:seed`) y se inició con `npm run start:local`. `/api/health` respondió HTTP 200, `modo=local`, `schemaVersion=9`. `.env.local` y `ZOHO_TRANSPORT` no se tocaron; no se llamó a Zoho real ni hubo push o merge. A4 permanece pendiente de aprobación.
