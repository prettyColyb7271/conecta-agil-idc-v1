# Mapeo de Conecta Ágil IDC con Zoho Projects

## Estado A4

La integración tiene una outbox transaccional y la pantalla de administración muestra una maqueta de Zoho Projects. El transporte predeterminado es `ZOHO_TRANSPORT=file`, que guarda un JSON por envío en `LOCAL_DATA_DIR/zoho-outbox/`. No hay credenciales y no se realizaron llamadas reales a Zoho. La dueña eligió el modo archivo para la presentación con el plan gratuito; los documentos nunca se envían a Zoho.

El transporte `api` implementa OAuth 2.0 con refresh token, pero queda sin validar contra Zoho hasta disponer de credenciales. Las variables están documentadas vacías en `.env.example`.

## Mapeo de datos

| Conecta Ágil IDC | Zoho Projects / maqueta | Datos incluidos |
|---|---|---|
| Expediente | Proyecto identificado visualmente por folio IDC | Folio |
| Gate interno G0–G7 | Tarea `Gate 1`–`Gate 8` | Estado, fechas de apertura/cierre y responsable |
| Requisito o evento asociado al Gate | Subtarea de la tarea | Código de requisito o etiqueta genérica de evento y estado |
| Responsable IDC | Responsable visible | Nombre mostrado por la aplicación |

Los ocho Gates y sus subtareas se proyectan desde snapshots de la outbox, no desde documentos ni desde datos de presentación independientes. Las tareas representan el estado operativo; la aplicación local continúa siendo la fuente de verdad.

## Transacción, entrega y reintentos

- La fila de outbox se inserta en la misma transacción que el evento del expediente, incluido el reproceso `cfe_incompleto`. Si una escritura de esa transacción falla, se revierten tanto el evento como la outbox.
- El envío ocurre después del commit. Un fallo de transporte marca el registro `fallido` sin bloquear ni revertir el flujo del expediente.
- Reintentar conserva el `zoho_id` de la entrega satisfactoria y un envío ya completado no vuelve a duplicarse.

## Privacidad y acceso

El payload y la maqueta incluyen solo folio, Gate, estado, fechas, responsable, códigos de requisitos y etiquetas genéricas de eventos. Nunca incluyen RFC, INE, archivos o contenido de documentos, retroalimentación de CFE ni notas internas. La pantalla y su API son exclusivas del admin; gestor y cliente reciben 403.

Fuentes de implementación: [outbox.ts](../lib/zoho/outbox.ts), [adapter.ts](../lib/zoho/adapter.ts), [integraciones admin](../app/admin/integraciones/IntegrationsPanel.tsx) y [regresión A4](reportes/PASO_A4.md).
