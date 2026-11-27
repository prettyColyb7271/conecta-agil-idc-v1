# Paso A3 · vigencia, alertas e indicadores

Rama `paso-a3`, creada desde `desarrollo` en `ccf4570`. El supervisor aprobó A3. Los commits iniciales de A3 fueron:

| Commit | Bloque |
|---|---|
| `062aca8` | Vigencia en meses calendario y alertas de oficio |
| `51cd4b2` | Indicadores reales, banners, auditoría de consulta, nombres visibles de Gate y regresión A3 |

## Cambios

- `sumarMesesCalendario` es el helper compartido por la carga de evidencia y el registro de eventos. Limita al último día del mes de destino y conserva la hora; se cubren fin de mes y febrero bisiesto.
- El Gestor IDC y el portal del cliente muestran la fecha límite y los días restantes del oficio favorable o condicionado mientras Gate 6 (código interno `G5`) siga abierto. Más de 10 días es informativo; 10 o menos y el vencimiento son rojos. `gateRows` aplica el mismo umbral.
- En modo local, el tablero del Gestor calcula desde la base los expedientes por Gate, el semáforo, el tiempo hasta acuse y alta y los rechazos iniciales por `cfe_incompleto`. Los tiempos sin datos muestran “Aún no hay datos”. Los mocks de `data/mock.ts` solo alimentan la línea base de demo.
- La consulta autorizada del detalle registra `consulta_detalle_expediente` en auditoría con metadata `{}`; no se guarda contenido. El acceso del cliente al portal también queda registrado.
- La UI muestra “Gate N” (1–8) con su nombre y traduce códigos `G0`–`G7` en mensajes visibles, sin cambiar los códigos internos.

## Verificación

Todo se ejecutó en una copia aislada con `npm ci`, modo local y datos ficticios, salvo el build final y la migración local descritos en “Servidor”.

| Verificación | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx --no-install tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ 5 plantillas DOCX y F-01 PDF |
| `npm run build` en la copia aislada | ✅ |
| `npm run test:e2e:isolated` | ✅ 18 entradas, 623 comprobaciones, 0 fallos |
| `regresiones-pr1` | ✅ Incluye meses calendario, año bisiesto, traducción de Gates, alertas y encabezados de carga/error |
| `supervisor-a3` | ✅ 9 / 0: banner rojo para ambos roles, `gateRows`, indicadores, auditoría sin contenido y ocultamiento al cerrar Gate 6 |
| `supervisor-origen-8d` | ✅ 36 / 0; recuperación de cliente cubierta |
| Flujo A1 en navegador aislado | ✅ Se verificó “Cargando…”, el error “No se pudo cargar el avance”, “Reintentar” y la recuperación a Gate 1 |

Las capturas se generaron en Edge headless contra el build local y una base temporal sembrada exclusivamente con datos ficticios:

- [Banner del Gestor IDC](img/a3-banner-gestor.png)
- [Banner del cliente](img/a3-banner-cliente.png)
- [Indicadores del Gestor IDC](img/a3-indicadores.png)

## Servidor tras la validación original de A3

Se detuvo solo el proceso anterior de `:3140`, se compiló con `APP_MODE=local` y `NEXT_PUBLIC_MODO=local`, y se aplicó `npm run db:migrate` sin seed. `npm run start:local` quedó activo y `http://localhost:3140/api/health` respondió HTTP 200 con `schemaVersion=8`.

A3 fue aprobado por el supervisor. El estado final de integración de A3b se mantiene en `00_LEEME_PRIMERO/ESTADO_ACTUAL.md`.

## A3b · metas solo en demo, avisos con contexto y fechas locales

- En el portal local se ocultaron las metas ilustrativas del anteproyecto. En demo se conservan bajo “Metas del proyecto” y cada cifra se identifica como “Meta: …”. La otra vista que usa esos datos, el Gestor IDC, ya limita sus metas y tendencias a demo; en modo local calcula indicadores desde la base.
- Los avisos del cliente explican que debe firmarse el contrato antes del vencimiento y qué hacer cuando el oficio ya venció. En el Gestor, la tabla de proyectos y la revisión muestran “Oficio CFE” con días y fecha límite.
- Se agregó `formatoFecha` para fechas visibles en formato `dd/mm/aaaa` (`es-MX`), usando UTC para evitar cambios de día por zona horaria. Se aplica a alertas, G4, reproceso y fechas de revisión; el almacenamiento no cambió.
- `supervisor-a3.mjs` ahora imprime el resumen reconocido por `isolated.mjs` y falla el proceso ante cualquier ❌.

### Verificación A3b

Regla 2 ejecutada en la copia aislada `C:\a3bv` después de `npm ci`, con modo local y datos ficticios.

| Verificación | Resultado |
|---|---|
| `npm run lint` | ✅ |
| `npx --no-install tsc --noEmit` | ✅ |
| `npm run plantillas:check` | ✅ 5 plantillas DOCX y F-01 PDF |
| `npm run build` | ✅ |
| `npm run test:e2e:isolated` | ✅ 18 entradas; 626 comprobaciones reportadas, 0 fallos |
| `regresiones-pr1` | ✅ Fechas `dd/mm/aaaa` y textos de vencimiento/expiración para cliente y Gestor |
| `supervisor-a3` | ✅ 12 / 0; portal local sin “90%” ni “4.5”, alertas con contexto/fecha y Gate 6 |
| Capturas aisladas | ✅ Cliente sin metas y Gestor con la alerta tanto en tabla como en revisión |

Las capturas actualizadas usan solo expedientes ficticios: [Gestor IDC](img/a3-banner-gestor.png) y [portal del cliente](img/a3-banner-cliente.png). `npm ci` informó 7 vulnerabilidades moderadas del árbol de dependencias; no se modificaron dependencias ni se aplicó `npm audit fix`.

El commit A3b usa el mensaje `A3b: metas solo en demo, avisos con contexto y fechas dd/mm/aaaa`. No se desplegó a Vercel.
