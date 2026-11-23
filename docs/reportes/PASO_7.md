# PASO 7 — G3–G7 ingreso, resolución, contrato, UIIE y cierre

## Entrega

- [OBSERVADO EN ARCHIVO: `lib/db/migrations/007_paso7_eventos_externos.sql`] Se agregan medio y número de solicitud, vigencia y resultado del oficio, subgate, reinicio de plazo y eventos de interconexión, alta comercial y certificado UIIE. La migración agrega `workflow_status` sin recrear tablas referenciadas por documentos u observaciones.
- [OBSERVADO EN ARCHIVO: `lib/data/gates.ts`] G3 exige acuse con medio, número y documento; G4 exige vigencia, resultado y evidencia del subgate cuando aplica; G5 exige contrato; G6 inicializa U01–U17 y reutiliza `version_id`; G7 exige medidor, interconexión, alta comercial y revisión por un Gestor IDC distinto del responsable.
- [PROPUESTA] Las alertas de vencimiento de G4 se calculan al consultar: ámbar cuando quedan diez días o menos y roja cuando el oficio venció. No hay cron ni cierre automático.
- [OBSERVADO EN ARCHIVO: `lib/data/expedientes.ts`] La vista del expediente expone el resumen de eventos externos (tipo, fecha, descripción y documento), por lo que el cliente puede consultar su línea de tiempo sin recibir auditoría interna.
- [OBSERVADO EN ARCHIVO: `tests/e2e/supervisor-paso7.mjs`] Se verifican el rechazo de G3 sin acuse, validaciones de acuse/oficio, aislamiento del cliente y prohibición para el administrador.

## Pendientes de producto

- [PENDIENTE IDC] Captura guiada de los datos estructurados U12/U13/U17 y formulario completo de memoria F-05.
- [PENDIENTE IDC] La pantalla visual de la línea de tiempo debe presentar los eventos ya disponibles en la respuesta del expediente.
- [PENDIENTE IDC] El texto legal y los datos del oficio, contrato y certificado deben ser aprobados por IDC.
