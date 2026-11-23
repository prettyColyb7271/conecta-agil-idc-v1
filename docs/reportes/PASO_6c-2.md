# PASO 6c-2 — Pruebas restauradas, seed de plantillas y catálogo unificado

## Cambios

- [OBSERVADO EN ARCHIVO: `tests/e2e/supervisor-flujo-g0-g2.mjs`] F-02 ahora
  comprueba que el DOCX generado conserva el título, la palabra `testigo`, el
  folio y el nombre ficticio del cliente. F-06 comprueba el folio y los
  primeros 12 caracteres del SHA-256 de R06.
- [OBSERVADO EN ARCHIVO: `tests/e2e/supervisor-gestores.mjs`] Se cubren enlaces
  de un solo uso, invalidación al generar otro enlace, vencimiento simulado
  mediante `expires_at`, invalidación durante reset y ausencia de secretos.
- [OBSERVADO EN ARCHIVO: `lib/db/migrations/006_plantillas_docx.sql`] La
  migración quedó igual que la versión aplicada originalmente; no se editan
  migraciones ya ejecutadas.
- [PROPUESTA] `lib/db/seed.ts` registra las cinco plantillas por defecto
  (F-02 a F-06) leyendo el archivo real, calculando SHA-256 y tamaño. Si cambia
  el hash, conserva la versión anterior y crea una nueva activa. El seed es
  idempotente.
- [PROPUESTA] La convención única para plantillas es `grupo.campo`. El titular
  se expone como `cliente.*` y el mapper lo obtiene de
  `data_json.solicitante`; el correo del enlace CFE se expone como
  `responsable_cfe.correo`.
- [OBSERVADO EN ARCHIVO: `lib/data/templates.ts`] Se eliminó `TEMPLATE_FIELDS`;
  las advertencias de datos faltantes se derivan de
  `templates/marcas.catalogo.json`.

## Catálogo y plantillas

La fuente única es [marcas.catalogo.json](../../templates/marcas.catalogo.json).
Las plantillas activas usan:

- F-02: `cliente.*`, `firma.*`, `apoderado.*` y `testigo*.*`.
- F-03: las marcas de F-02 más `servicio.rpu` y `servicio.domicilio`.
- F-04: `cliente.*`, `responsable_cliente.*`,
  `responsable_cfe.*`, `servicio.*` y `central.*`.
- F-05: `cliente.*`, `central.capacidad_kw`, `expediente.*` e
  `ingeniero.nombre`.
- F-06: `expediente.*`, `cliente.nombre`, `central.capacidad_kw`,
  `gestor.nombre` y `{{#documentos}}...{{/documentos}}`.
- [OBSERVADO EN ARCHIVO: `templates/F-02_carta_poder.docx`] F-02 incluye
  `expediente.folio` también en el cuerpo para que el folio sea verificable
  en el XML principal del documento, además del encabezado.

Los artefactos visuales proporcionados por la dueña permanecen en
`docs/PLANTILLAS_IDC_PASO_6C_v2/` para revisión. No se reescribió historia.

## Validación

- `npm run plantillas:check`: 5 plantillas válidas.
- `npm run lint`: correcto.
- `npx tsc --noEmit`: correcto.
- `npm run build` con `APP_MODE=local`: correcto.
- `test:e2e:isolated`: 94/94 general, 33/33 documentos, 13/13 Paso 6,
  27/27 gestores y 37/37 flujo G0→G2.
