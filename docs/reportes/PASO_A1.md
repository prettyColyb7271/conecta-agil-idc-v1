# Paso A1 · Firma presencial y encabezado del gate

Rama `paso-a1`, creada desde `desarrollo` (`3af795f`). Sin push ni merge.

## Commits y archivos

| Commit | Cambio | Archivos |
|---|---|---|
| `bed336b` | Encabezado y selección del gate actual | `components/LocalGestorReview.tsx`, `lib/semaforo.ts`, `tests/e2e/regresiones-pr1.ts` |
| `114d0c2` | Flujo de firma G2 y regresión | `components/LocalGestorReview.tsx`, `lib/data/documents.ts`, `lib/data/gates.ts`, `tests/e2e/isolated.mjs`, `tests/e2e/supervisor-a1-firma-ui.mjs` |

Este reporte se agrega en un commit posterior de documentación.

## Implementación

- El gestor puede marcar F-01 y F-02 para firma, subir los escaneos R01 y R07, solicitar su verificación por otro gestor, registrar la firma presencial y cerrar G2 cuando se cumplen sus requisitos. Los errores de la API se muestran sin sustituir su mensaje.
- La carga de la evidencia ya crea un evento `firma_presencial`. El registro por `gates` completa ese mismo evento identificado por documento, en lugar de crear otro; repetir el registro conserva el identificador. Se mantiene la compatibilidad con los flujos existentes y se registra la actualización en auditoría.
- El encabezado distingue carga, error y expediente cerrado; usa la misma regla de gate actual para el encabezado y la pestaña inicial. En caso de error ofrece reintento.
- La prueba nueva recorre G2 con un cliente y dos gestores mediante las rutas y cuerpos utilizados por la interfaz, comprueba los 409 y que quede exactamente un evento con evidencia, lugar y firmantes.

## Pruebas

Lint, TypeScript, plantillas, build y regresión se ejecutaron con modo local en una copia aislada; la base y los archivos de las pruebas fueron temporales. No se usó :3140 para las pruebas.

| Prueba | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx --no-install tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ |
| `npm run build` en copia aislada | ✅ |
| `npm run test:e2e:isolated` | ✅ 386 / 0; además cuatro comandos sin conteo |
| `regresiones-pr1` | ✅ exit 0, sin conteo |
| `migration-004-with-data` | ✅ exit 0, sin conteo |
| `supervisor-a0-runner` | ✅ 8 / 0 |
| `db-migrate`, base temporal | ✅ exit 0, sin conteo |
| `db-seed`, base temporal | ✅ exit 0, sin conteo |
| `supervisor-pasos-1-4` | ✅ 94 / 0 |
| `supervisor-documentos` | ✅ 33 / 0 |
| `supervisor-paso6` | ✅ 13 / 0 |
| `supervisor-gestores` | ✅ 27 / 0 |
| `supervisor-flujo-g0-g2` | ✅ 37 / 0 |
| `supervisor-a1-firma-ui` | ✅ 18 / 0 |
| `supervisor-paso7` | ✅ 6 / 0 |
| `supervisor-flujo-g3-g7` | ✅ 68 / 0 |
| `supervisor-seguridad-aislado` | ✅ 10 / 0 |
| `supervisor-seguridad-ataque` | ✅ 36 / 0 |
| `supervisor-origen-8d` | ✅ 36 / 0 |

La suite nueva también pasó por separado (18/0). En un navegador con datos ficticios se comprobaron la selección y carga del gate, el reintento, los botones deshabilitados y la presentación literal de un 409 simulado; se interceptaron las solicitudes del formulario para comprobar sus cuerpos, sin guardar el evento simulado. La prueba e2e anterior comprueba la persistencia real en una base temporal.

## Servidor y pendientes

Se detuvo únicamente el proceso que escuchaba en :3140, se compiló la rama con el puerto detenido y se inició `npm run start:local` de forma persistente. `/api/health` respondió 200. No se ejecutaron migraciones ni semilla sobre la base real.

Pendiente: revisión y aprobación del supervisor. Se conserva la copia aislada de validación para esa revisión.
