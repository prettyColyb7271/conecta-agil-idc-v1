# Catálogo de marcas de plantillas IDC

La fuente única es [marcas.catalogo.json](../templates/marcas.catalogo.json).
El validador CLI, la carga web y el motor DOCX leen sus marcas desde ese
archivo. Una marca se escribe en minúsculas, con `snake_case`, sin acentos y
con un máximo de dos niveles: `grupo.campo`. Las listas tienen nombre plural.

## Tabla maestra resumida

| Marca | Tipo | Ejemplo ficticio | Origen/captura | Gate | Sensible | Formatos |
|---|---|---|---|---|---|---|
| `expediente.folio` | texto | IDC-2026-0001 | sistema | G1 | no | F-06 |
| `cliente.nombre` | texto | Empresa Solar Ficticia S.A. de C.V. | cliente (desde `data_json.solicitante`) | G1 | no | F-02,F-03,F-04,F-05,F-06 |
| `cliente.tipo_persona` | texto | PERSONA FISICA | cliente | G1 | no | F-02,F-03 |
| `cliente.rfc` | texto | XAXX010101000 | cliente (desde `data_json.solicitante`) | G1 | sí | — |
| `otorgante.nombre` | texto | Empresa Solar Ficticia S.A. de C.V. | cliente | G1 | no | F-02,F-03 |
| `apoderado.nombre` | texto | Apoderado Ficticio | cliente | G1 | no | F-02,F-03 |
| `testigo1.nombre` / `testigo2.nombre` | texto | Testigo Ficticio Uno/Dos | cliente | G1 | no | F-02,F-03 |
| `testigo1.identificacion` / `testigo2.identificacion` | texto | INE-FICTICIA-003/004 | cliente | G1 | sí | F-02,F-03 |
| `firma.lugar` | texto | Hermosillo, Sonora | cliente/IDC | G2 | no | F-02,F-03 |
| `firma.fecha_larga` | fecha_larga | 23 de noviembre de 2026 | sistema | G2 | no | F-02,F-03 |
| `servicio.rpu` | texto | 123456789012 | cliente | G1 | sí | F-04 |
| `servicio.tarifa` | texto | GDMTH | cliente | G1 | no | F-04 |
| `central.capacidad_kw` | decimal_2 | 187.50 | cliente | G1 | no | F-05 |
| `responsable_cliente.nombre` | texto | UVIE Ficticio | cliente/IDC | G1 | no | F-04 |
| `responsable_cfe.nombre` | texto | Enlace CFE Ficticio | CFE/IDC | G1 | no | F-04 |
| `responsable_cfe.correo` | correo | enlace.cfe@example.invalid | CFE/IDC | G1 | sí | F-04 |
| `ingeniero.nombre` | texto | Ingeniero Ficticio | cliente/IDC | G1 | no | F-05 |
| `memoria.inversor` | texto | Inversor Ficticio 250 kW | cliente | G1 | no | F-05 |
| `memoria.strings` | lista | String A | cliente | G1 | no | F-05 |
| `documentos` | lista | R01, R02... | sistema | G1/G2 | no | F-06 |

El catálogo JSON contiene el inventario completo, tipo, ejemplo, sensibilidad,
origen, gate, marcas obligatorias, opcionales, ciclos y firmas.

## Marcas por formato

- **F-02 — carta poder para interconexión:** cliente, tipo de persona, lugar,
  fecha, apoderado y dos testigos. Conserva la estructura de la carta original
  del expediente y cuatro espacios de firma. El texto legal queda como
  `[TEXTO PENDIENTE DE APROBACIÓN IDC]`.
- **F-03 — carta poder simple UIIE:** cliente, tipo de persona, lugar, fecha,
  RPU, domicilio del servicio, apoderado y dos testigos, con objeto UIIE y
  cuatro firmas.
- **F-04 — ficha U12/U13/U17:** cliente, fecha, gestor, responsable, correo,
  teléfono, enlace CFE, correo del enlace, RPU, tarifa, tensión, tecnología,
  capacidad y domicilio del servicio.
- **F-05 — memoria fotovoltaica:** cliente, capacidad, folio, ingeniero
  responsable y trámite. La captura técnica queda pendiente y fuera de 6c.
- **F-06 — carátula e índice:** folio, fecha, cliente, trámite, capacidad,
  gestor y ciclo de documentos con identificador, estado, nombre, páginas,
  RPU y SHA-256 corto.

## Ciclos y configuración

La única sintaxis de ciclos es:

```text
{{#documentos}}
{{documento.codigo}} {{documento.estado}} {{documento.nombre}} {{documento.paginas}} {{documento.rpu}} {{documento.sha256_corto}}
{{/documentos}}
```

No se deben anidar ciclos ni usar otra sintaxis. El parser resuelve rutas con
puntos. `nullGetter` produce `______`; los faltantes obligatorios se devuelven
como advertencias sin inventar datos.

## Huecos y conflictos conocidos

- La aplicación histórica usa `data_json.solicitante`, `servicio_actual` y
  `central`; las plantillas usan únicamente `cliente.*`, `servicio.*` y
  `central.*`. El mapper traduce esos datos sin renombrar ni migrar
  destructivamente `data_json`.
- El correo del Enlace Empresarial se normaliza como
  `responsable_cfe.correo`; `enlace_cfe` se presenta como
  `responsable_cfe.nombre`.
- Otorgante, apoderado, testigos, identificaciones, firma, U12/U13/U17 y
  responsables CFE aún requieren captura explícita.
- `cfe.area_destinataria` y el texto legal final requieren confirmación IDC.
- F-05 tiene catálogo y plantilla, pero no formulario técnico en 6c.
- RFC, CURP, identificaciones y domicilio particular solo se permiten en los
  formatos indicados por el catálogo y no deben aparecer en exportaciones
  generales.

## Guía corta para Word

1. Escribe la marca de un solo golpe dentro del mismo nodo de Word.
2. No cambies el formato a mitad de una marca.
3. Usa únicamente marcas del catálogo y guarda como `.docx`.
4. No uses `.docm`, `vbaProject.bin` ni macros.
5. Ejecuta `npm run plantillas:check` antes de subirla.
6. Una marca desconocida rechaza la carga; una obligatoria ausente se reporta
   como advertencia.

## Clasificación de afirmaciones

- [OBSERVADO EN ARCHIVO: `lib/data/expedientes.ts`, `lib/db/seed.ts`,
  `templates/F-01_campos.json`] Campos actuales, validaciones y datos ficticios.
- [OBSERVADO EN ARCHIVO: `lib/data/templates.ts`,
  `lib/data/template-catalog.ts`] Motor DOCX, delimitadores y validación.
- [PROPUESTA] Nombres normalizados, grupos de marcas, derivaciones y reglas de
  sensibilidad del catálogo.
- [PENDIENTE IDC] Texto legal de F-02/F-03, destinatario CFE, responsables
  U12/U13/U17 y formulario técnico F-05.

## PAQUETE PARA CHATGPT

Convención: marcas en minúsculas, sin acentos, `snake_case`, máximo dos niveles;
listas en plural; delimitadores `{{` y `}}`; faltante `______`.

- **F-02:** `cliente.nombre`, `cliente.tipo_persona`, `firma.fecha_corta`,
  `firma.lugar`, `apoderado.nombre`, `testigo1.nombre`, `testigo2.nombre`.
- **F-03:** las marcas de F-02 más `servicio.rpu` y
  `servicio.domicilio`.
- **F-04:** `cliente.nombre`, `firma.fecha_corta`, `gestor.nombre`,
  `responsable_cliente.nombre`, `responsable_cliente.correo`,
  `responsable_cliente.telefono`, `responsable_cfe.nombre`,
  `responsable_cfe.correo`, `servicio.rpu`, `servicio.tarifa`,
  `servicio.domicilio`, `central.tension`, `central.tecnologia`,
  `central.capacidad_kw`.
- **F-05:** `cliente.nombre`, `central.capacidad_kw`,
  `expediente.folio`, `ingeniero.nombre`, `expediente.tramite`.
- **F-06:** `expediente.folio`, `expediente.fecha`, `cliente.nombre`,
  `expediente.tramite`, `central.capacidad_kw`, `gestor.nombre` y el ciclo
  `{{#documentos}}...{{/documentos}}` con marcas `documento.*`.

Reglas Word: marca de corrido, no cambiar formato a media marca, guardar como
`.docx`, sin macros. [OBSERVADO EN ARCHIVO] se refiere a rutas existentes;
[PROPUESTA] es la normalización; [PENDIENTE IDC] requiere confirmación.
## F-01 PDF gestionable

F-01 conserva el PDF oficial de CFE en `templates/F-01_base.pdf` y usa `templates/F-01_gestionable.pdf` como versión AcroForm. Sus campos siguen la convención `grupo.campo`; la lista y coordenadas se mantienen en `templates/F-01_campos.json`. La plantilla no contiene JavaScript y se valida con `npm run plantillas:check`.
