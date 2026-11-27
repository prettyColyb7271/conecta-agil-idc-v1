# Paso A3 · vigencia, alertas e indicadores

Rama `paso-a3`, creada desde `desarrollo` en `ccf4570`. A3 sigue en revisión; no se ha hecho push ni merge. Commits de código:

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

## Servidor y estado

Se detuvo solo el proceso anterior de `:3140`, se compiló con `APP_MODE=local` y `NEXT_PUBLIC_MODO=local`, y se aplicó `npm run db:migrate` sin seed. `npm run start:local` quedó activo y `http://localhost:3140/api/health` respondió HTTP 200 con `schemaVersion=8`.

A3 queda en 🟡 en `paso-a3`, pendiente de revisión del supervisor. No se modificó `main`; no se hizo push ni merge.
