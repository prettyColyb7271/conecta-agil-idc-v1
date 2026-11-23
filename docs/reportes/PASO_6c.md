# PASO 6c — Plantillas Word para formatos IDC

Se incorporó generación DOCX con docxtemplater y pizzip para F-02, F-03, F-04
y F-06. F-01 permanece PDF; los escaneos siguen ligados mediante
`sourceVersionId`. Las plantillas se validan como ZIP DOCX, sin macros,
etiquetas partidas y con límite de 5 MB. La migración 006 versiona plantillas
activas y sus hashes, y el Gestor IDC puede listar, cargar y descargar
versiones.

El catálogo único `templates/marcas.catalogo.json` documenta F-02–F-06,
grupos, marcas normalizadas, ciclos `{{#lista}}`, campos sensibles, origen,
gates y brechas. El validador de carga y `plantillas:check` rechazan marcas
desconocidas, reportan faltantes requeridos y usan `______` para valores nulos.

Validación: `npm run plantillas:check`, `npx tsc --noEmit`, lint, build y las
suites E2E existentes. La conversión opcional a PDF no es requerida: si se
instala `soffice` puede realizarse fuera del flujo de generación.

## Catálogo integrado

`templates/marcas.catalogo.json` es la fuente única y contiene:

- marcas normalizadas en minúsculas, `snake_case` y máximo dos niveles;
- los grupos expediente, documento, plantilla, solicitante, representante,
  otorgante, apoderado, testigo1, testigo2, contacto, servicio, central, cfe,
  gestor, coordinador, firma, revision, responsable_cliente,
  responsable_cfe, memoria y documentos;
- sensibilidad, origen, ejemplo, gate y formatos permitidos;
- F-02/F-03 con cuatro firmantes, F-04 con U12/U13/U17, F-05 con estructura
  de memoria FV y F-06 con el ciclo de documentos;
- `nullGetter` `______` y el ciclo único
  `{{#documentos}}...{{/documentos}}`.

Los huecos que necesitan decisión IDC son el texto legal, el área destinataria
de CFE, responsables U12/U13/U17 y el formulario técnico de F-05. La captura
técnica de F-05 queda fuera de 6c.

## PAQUETE PARA CHATGPT

[OBSERVADO EN ARCHIVO: `lib/data/expedientes.ts`, `lib/db/seed.ts`,
`templates/F-01_campos.json`] La aplicación ya captura solicitante, servicio,
central y requisitos; F-01 permanece PDF CFE con coordenadas.

[OBSERVADO EN ARCHIVO: `lib/data/templates.ts`,
`lib/data/template-catalog.ts`] El motor usa docxtemplater/pizzip, delimitadores
`{{ }}`, rutas con punto y faltantes como `______`.

[PROPUESTA] Convención: minúsculas, sin acentos, `snake_case`, máximo dos
niveles; las listas son plurales y los ciclos son únicamente
`{{#lista}}...{{/lista}}`.

[PENDIENTE IDC] Confirmar texto legal F-02/F-03, destinatario CFE,
responsables U12/U13/U17 y formulario técnico F-05.

- F-02 — carta poder de interconexión; firmantes otorgante, apoderado,
  testigo1 y testigo2. Marcas:
  `otorgante.nombre`, `otorgante.identificacion`, `apoderado.nombre`,
  `apoderado.cargo`, `apoderado.identificacion`, `testigo1.nombre`,
  `testigo1.identificacion`, `testigo2.nombre`,
  `testigo2.identificacion`, `firma.lugar`, `firma.fecha_larga`,
  `cfe.area_destinataria`, `expediente.tramite`.
- F-03 — carta poder simple UIIE; mismos cuatro firmantes y marcas de firma,
  con el objeto UIIE.
- F-04 — ficha U12/U13/U17; marcas:
  `servicio.titular`, `servicio.rpu`, `servicio.tarifa`, `central.tension`,
  `responsable_cliente.nombre`, `responsable_cliente.correo`,
  `responsable_cliente.telefono`, `responsable_cfe.nombre`,
  `responsable_cfe.correo`, `responsable_cfe.telefono`.
- F-05 — memoria FV; marcas:
  `memoria.consumo_kwh`, `memoria.potencia_requerida_kw`,
  `memoria.numero_modulos`, `memoria.produccion_kwh`, `memoria.inversor`,
  `memoria.relacion_dc_ac`, `memoria.strings`, `central.capacidad_kw`.
- F-06 — carátula e índice; marcas `expediente.folio`,
  `expediente.tramite`, `expediente.fecha` y ciclo:
  `{{#documentos}}{{documento.codigo}}{{documento.estado}}{{documento.version}}{{documento.sha256_corto}}{{/documentos}}`.

Reglas de Word: escribir la marca de corrido, no cambiar formato a media
marca, guardar como `.docx`, sin macros ni `.docm`.
