# PASO 7b — Evidencias externas, UIIE operable y cierre de expediente

## Alcance

- [OBSERVADO EN ARCHIVO: `lib/data/documents.ts`] El Gestor IDC puede cargar evidencias externas en PDF/JPG/PNG con validación de tamaño, MIME y magic bytes. La carga crea el documento, su versión y el evento externo en una transacción.
- [OBSERVADO EN ARCHIVO: `app/api/expedientes/[id]/documents/route.ts`] La carga multipart distingue `eventType` de `requirementCode` y permanece disponible con G1 cerrado mientras el expediente no esté cerrado.
- [OBSERVADO EN ARCHIVO: `lib/data/gates.ts`] Un evento solo puede ligar un documento `source = externo` cuyo tipo corresponda exactamente al evento; un documento de requisito no puede usarse como acuse, oficio, contrato o evidencia de cierre.
- [OBSERVADO EN ARCHIVO: `lib/data/documents.ts`] R01–R11 conservan el bloqueo posterior a G1; U01–U17 pueden cargarse y validarse cuando G6 está abierto, manteniendo PA-02.
- [OBSERVADO EN ARCHIVO: `lib/data/gates.ts`] Al abrir G6 se crean U01–U17 y se reutilizan versiones vigentes de requisitos compatibles. U12, U13 y U17 requieren datos estructurados y validación explícita de un Gestor IDC.
- [OBSERVADO EN ARCHIVO: `lib/data/gates.ts`] G7 exige medidor, interconexión, alta comercial y revisión por un Gestor IDC distinto del responsable. Al cerrar, el expediente pasa a `cerrado` y las operaciones posteriores quedan bloqueadas.
- [OBSERVADO EN ARCHIVO: `lib/data/gates.ts`] `cfe_incompleto` registra el evento, reinicia G1, limpia su cierre, observa los requisitos afectados y bloquea G2–G7 dentro de una única transacción.
- [OBSERVADO EN ARCHIVO: `lib/data/gates.ts`] Las alertas del oficio resolutivo se calculan al consultar: ámbar con diez días o menos y roja cuando vence; no existe cierre automático.

## Pruebas ejecutadas

- [OBSERVADO EN ARCHIVO: `tests/e2e/supervisor-flujo-g3-g7.mjs`] Flujo real G0–G7: 52/52 verificaciones, incluyendo evidencia externa por evento, rechazo de la INE como acuse, U01–U17, cierre por segundo Gestor IDC y bloqueo del expediente cerrado.
- [OBSERVADO EN ARCHIVO: `tests/e2e/supervisor-flujo-g0-g2.mjs`] Flujo G0–G2 y PA-04/PA-05/PA-06: 37/37 verificaciones.
- [OBSERVADO EN ARCHIVO: `tests/e2e/supervisor-paso7.mjs`] Validaciones de G3, evidencia obligatoria, aislamiento del cliente y prohibición para el administrador.

## Pendientes de producto

- [PENDIENTE IDC] Aprobar el contenido legal y operativo de los documentos externos y del oficio resolutivo.
- [PENDIENTE IDC] Completar la captura guiada de la memoria F-05; en este paso U09 permanece como carga manual.
- [PENDIENTE IDC] La pantalla de línea de tiempo debe mostrar los eventos externos ya disponibles sin exponer auditoría interna.
