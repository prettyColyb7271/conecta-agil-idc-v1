# Paso A2 · Eventos externos G3–G7

Rama `paso-a2`, desde `desarrollo` (`d29d462`). A1 se integró por fast-forward y se publicó en `desarrollo`; `main` no cambió. A2 no se ha integrado ni publicado.

## Commits y archivos

| Commit | Bloque | Archivos |
|---|---|---|
| `fdd53a5` | Eventos, reproceso y prueba de recorrido | `app/api/expedientes/[id]/documents/route.ts`, `lib/data/documents.ts`, `lib/data/expedientes.ts`, `lib/data/gates.ts`, `tests/e2e/isolated.mjs`, `tests/e2e/corrida-ui-g0-g7.mjs` |
| `d53ada0` | Pantalla y capturas ficticias | `app/gestor/page.tsx`, `components/LocalGestorReview.tsx`, `components/RegistrarEventos.tsx`, `docs/reportes/img/a2-g3.png`, `docs/reportes/img/a2-g6.png`, `docs/reportes/img/a2-cerrado.png` |

Este reporte se agrega en un commit posterior de documentación.

## Cambios

- G3–G7 muestran formularios, requisitos pendientes y cierre condicionado. G3 muestra R10/R11 y un reproceso separado con motivo y confirmación; G4 admite los tres resultados, muestra la fecha límite y requiere el PDF del subgate para un oficio condicionado; G6 registra la visita con `eventType: "uiie"` y muestra U01–U17; G7 deshabilita el cierre para el responsable.
- Cada evidencia documental crea un único evento mediante `/documents`. Para el subgate se amplió esa misma carga con un segundo archivo; ambos documentos y el evento se registran en una transacción. El límite anterior de 21 MB para el cuerpo completo se conserva. `cfe_incompleto` y `cierre` usan `/gates`.
- A2 originalmente observaba todos los R. Esta regla fue sustituida por el reproceso selectivo de A2b, descrito más abajo.
- Al cerrar G5 se crean los U faltantes antes de aplicar reutilizaciones. Esto corrige que un expediente recién creado solo tuviera R y no pudiera completar G6. Los oficios de igual fecha se ordenan también por creación para que pantalla, cierre y reutilización coincidan.
- La carga única de acuse conserva la actualización de estado que antes se realizaba al registrar el evento por separado.

## Pruebas

En una copia aislada con datos ficticios y puertos distintos de :3140:

| Prueba | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx --no-install tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ |
| `npm run build` | ✅ |
| `npm run test:e2e:isolated` | ✅ 17 entradas, 579 / 0; cuatro sin conteo |
| `regresiones-pr1` | ✅ exit 0, sin conteo |
| `migration-004-with-data` | ✅ exit 0, sin conteo |
| `supervisor-a0-runner` | ✅ 8 / 0 |
| `db-migrate`, datos temporales | ✅ exit 0, sin conteo |
| `db-seed`, datos temporales | ✅ exit 0, sin conteo |
| `supervisor-pasos-1-4` | ✅ 94 / 0 |
| `supervisor-documentos` | ✅ 33 / 0 |
| `supervisor-paso6` | ✅ 13 / 0 |
| `supervisor-gestores` | ✅ 27 / 0 |
| `supervisor-flujo-g0-g2` | ✅ 37 / 0 |
| `supervisor-a1-firma-ui` | ✅ 18 / 0 |
| `supervisor-paso7` | ✅ 6 / 0 |
| `supervisor-flujo-g3-g7` | ✅ 68 / 0 |
| `corrida-ui-g0-g7` | ✅ 193 / 0 |
| `supervisor-seguridad-aislado` | ✅ 10 / 0 |
| `supervisor-seguridad-ataque` | ✅ 36 / 0 |
| `supervisor-origen-8d` | ✅ 36 / 0 |

La suite nueva crea un expediente, recorre G0–G7 con dos gestores y un cliente, comprueba los 409, un evento por tipo en el recorrido normal y el expediente cerrado. En expedientes separados verifica el reproceso y el reemplazo de un oficio no favorable. También verifica el subgate, el motivo visible al cliente y los U creados para un expediente nuevo.

En navegador aislado se comprobó el mensaje real de 409 del acuse, la confirmación de reproceso cancelada, el enlace al grupo U, una visita UIIE registrada desde el formulario y el botón de G7 deshabilitado para el responsable y habilitado para el otro gestor. [G3](img/a2-g3.png) · [G6](img/a2-g6.png) · [Expediente cerrado](img/a2-cerrado.png). Las capturas contienen solo datos ficticios.

Durante la primera regresión falló el límite de `Content-Length` por una ampliación indebida; se restauró el límite y la suite de documentos pasó 33/33. Una corrida interrumpida dejó un candado con un PID posteriormente reutilizado por Chrome; se comprobó la hora de creación y se retiró solo el candado obsoleto, sin tocar Chrome. La regresión final pasó completa.

## Servidor y pendientes

Se detuvo únicamente el proceso que escuchaba en :3140, se compiló con el puerto apagado y se arrancó `npm run start:local` de forma persistente. `/api/health` respondió 200. No se ejecutaron migraciones ni semilla sobre la base real.

- Pendiente la revisión del supervisor. Se conserva la copia aislada de A2 para esa revisión.
- La vigencia sigue la regla existente de 60 días por dos meses; el ajuste a meses de calendario corresponde a A3. El reinicio de plazo queda registrado, pero el contador de días hábiles sigue pendiente en el Bloque B.
- La creación de U faltantes ocurre al cerrar G5. Si algún expediente anterior ya llegó a G6 sin esos requisitos, no se ha reparado retrospectivamente ni se han inspeccionado datos reales; revisar y decidir cómo tratarlo antes de modificar esa base.
- El candado de regresión identifica procesos por PID: si el sistema reutiliza un PID tras una interrupción puede requerir comprobar manualmente que el candado sea obsoleto.

## A2b · Reproceso CFE selectivo

| Commit | Alcance |
|---|---|
| `cfeb895` | Reproceso selectivo, observaciones, pantallas, correo genérico y capturas |
| `f88d670` | Acuse registrado después del reinicio y prueba |

Archivos: `app/api/expedientes/[id]/gates/route.ts`, `app/portal/LocalPortal.tsx`, `app/portal/datos.ts`, `app/portal/formatos/LocalDocumentos.tsx`, `components/LocalGestorReview.tsx`, `components/RegistrarEventos.tsx`, `components/ReprocesoCfe.tsx`, `lib/data/documents.ts`, `lib/data/expedientes.ts`, `lib/data/gates.ts`, `lib/portal-cliente.ts`, `tests/e2e/corrida-ui-g0-g7.mjs` y las dos capturas de `docs/reportes/img/`. Fuera del repositorio se actualizaron la decisión D10, la fila G3 de la especificación y el tablero del plan.

El gestor selecciona R01–R11 y proporciona un mensaje general, retroalimentación individual y notas internas opcionales. En una transacción se observan solo los seleccionados, se conservan las observaciones históricas, se reabre G1 y se bloquean G2–G7. El portal muestra la retroalimentación visible y quién corrige según el catálogo, sin notas internas. R03 sigue siendo de IDC; R09 es del cliente. El aviso por correo no contiene detalles; si falla, la pantalla informa que el reproceso ya quedó registrado y que se avise al cliente por otro medio.

Si R01 o R07 no se observaron, G1 y G2 pueden cerrarse conservando las firmas verificadas. Si se observaron, se requiere escaneo verificado y firma presencial nuevos. G3 exige un acuse registrado después del último reinicio; se compara el orden de registro, no la fecha elegida para el documento. El acuse anterior se conserva como historial.

### Regla 2 y regresión final

Ejecutadas en la copia aislada con datos ficticios y sin usar :3140; todas finalizaron correctamente. El build en OneDrive se ejecutó después de detener :3140.

| Prueba | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx --no-install tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ 5 DOCX y F-01 PDF |
| `npm run build` | ✅ aislado y, con :3140 detenido, en OneDrive |
| `npm run test:e2e:isolated` | ✅ 17 entradas, 612 comprobaciones / 0 fallos; cuatro entradas sin conteo |
| `regresiones-pr1` | ✅ exit 0, sin conteo |
| `migration-004-with-data` | ✅ exit 0, sin conteo |
| `supervisor-a0-runner` | ✅ 8 / 0 |
| `db-migrate`, datos temporales | ✅ exit 0, sin conteo |
| `db-seed`, datos temporales | ✅ exit 0, sin conteo |
| `supervisor-pasos-1-4` | ✅ 94 / 0 |
| `supervisor-documentos` | ✅ 33 / 0 |
| `supervisor-paso6` | ✅ 13 / 0 |
| `supervisor-gestores` | ✅ 27 / 0 |
| `supervisor-flujo-g0-g2` | ✅ 37 / 0 |
| `supervisor-a1-firma-ui` | ✅ 18 / 0 |
| `supervisor-paso7` | ✅ 6 / 0 |
| `supervisor-flujo-g3-g7` | ✅ 68 / 0 |
| `corrida-ui-g0-g7` | ✅ 226 / 0 |
| `supervisor-seguridad-aislado` | ✅ 10 / 0 |
| `supervisor-seguridad-ataque` | ✅ 36 / 0 |
| `supervisor-origen-8d` | ✅ 36 / 0 |

La corrida comprueba la selección R09/R03, validación por otro gestor, privacidad de notas en portal y API, rechazo de carga de R03 por el cliente, correo genérico, conservación de firmas, nueva firma al observar R01 y rechazo del acuse anterior. Revisión visual con datos ficticios: [gestor](img/a2b-reproceso-gestor.png) y [cliente](img/a2b-reproceso-cliente.png).

`:3140` se reinició con `npm run start:local`; `/api/health` respondió 200. No se ejecutó seed ni migración sobre datos reales. Pendiente: revisión del supervisor; no se hizo push ni merge. El envío del correo depende de la configuración existente y su fallo se comunica al gestor.

## A2c · Vista completa del reproceso

`components/ReprocesoCfe.tsx` conserva la tabla resumida del reproceso y agrega el desplegable **“Ver los 11 documentos”**. Al expandirlo, muestra R01–R11 en orden, su semáforo, la última retroalimentación visible, quién debe corregir y la fecha de actualización. Las notas internas se renderizan solo en el panel del gestor; la vista del cliente no incluye esa columna ni el contenido interno. Se reutilizan los requisitos y las observaciones ya entregados por las rutas existentes; no se agregó almacenamiento nuevo.

`tests/e2e/corrida-ui-g0-g7.mjs` comprueba las 11 filas en orden y que una nota interna confidencial no aparezca en el panel expandido del cliente, además de las aserciones de privacidad ya existentes para el portal y su API.

### Verificación A2c

Ejecutada en la copia aislada `paso-a2c-validation`, con modo local, datos ficticios y sin usar ni reiniciar `:3140`.

| Prueba | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx --no-install tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ 5 plantillas DOCX y F-01 PDF |
| `npm run build` | ✅ |
| `npm run test:e2e:isolated` | ✅ 614 comprobaciones / 0 fallos; `corrida-ui-g0-g7.mjs`: 228 / 0 |

No se hizo push ni merge. Pendiente la revisión del supervisor.
