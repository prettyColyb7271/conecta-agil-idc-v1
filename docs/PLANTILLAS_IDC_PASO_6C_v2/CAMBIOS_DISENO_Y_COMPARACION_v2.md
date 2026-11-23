# Plantillas IDC — Paso 6c · Versión 2 (diseño unificado y apego al expediente)
23-11-2026 · Revisó: Claude · Sustituye el paquete `PLANTILLAS_IDC_PASO_6C` (v1, generado por ChatGPT). El paquete v1 se conserva sin cambios.

## 1. ¿Están todos los formatos?
| Código | Formato | ¿En este paquete? | Comentario |
|---|---|---|---|
| F-01 | Solicitud de interconexión | **No (correcto)** | Se mantiene como el **PDF original de CFE**, llenado por coordenadas. No es plantilla Word. |
| F-02 | Carta poder para interconexión ante CFE | Sí | Rehecha conforme al original (expediente, p. 27). |
| F-03 | Carta poder simple para la UIIE | Sí | No hay original en el expediente; sigue el mismo formato que F-02 y el texto del requisito 15 de la lista UIIE. |
| F-04 | Ficha de datos del servicio y responsables del certificado | Sí | Requisitos 12, 13 y 17 de la lista UIIE. |
| F-05 | Memoria de cálculo fotovoltaica | Sí (opcional) | Índice y numeración iguales a la memoria del expediente (pp. 37–41). |
| F-06 | Carátula e índice del expediente | Sí | Control interno de IDC, con un ciclo de filas. |

Con esto quedan cubiertos todos los formatos que genera la plataforma para el trámite MT (especificación §4.3). El dictamen UVIE, el oficio resolutivo, el contrato, el certificado UIIE y el acuse son documentos externos: solo se cargan, no se generan.

## 2. Diseño unificado (las 5 plantillas)
| Elemento | v1 | v2 |
|---|---|---|
| Color del texto fijo | Mezcla de azul marino, grises y colores sobrantes de la plantilla base de python-docx | **Negro (#000000)** en todo el texto fijo, incluidos títulos, encabezados de tabla, encabezado y pie |
| Datos que se llenan (`{{marcas}}` y `[CONTENIDO … IDC]`) | Negro o azul marino, a veces en negritas | **Azul de la plataforma (#2170B8)**. Al generar, docxtemplater conserva el formato del run, así que los datos llenados también salen en azul |
| Aviso «Texto pendiente de aprobación IDC» | Fondo amarillo (#FFF2B0) | **Azul**: fondo azul claro #EEF6FE, barra lateral y texto #2170B8 |
| Fuente | Arial, más Courier y Symbol heredadas de la plantilla base | **Solo Arial**: 11 pt en el cuerpo, 10 pt en tablas, 9 pt en notas, 7–8 pt en encabezado y pie, 14 pt en títulos |
| Márgenes | 2.5 cm (1417) en los cuatro lados | 2.5 cm en los cuatro lados; encabezado y pie a 1.25 cm (antes 0.88 y 0.90). Tamaño carta |
| Tablas | Encabezado azul marino con texto blanco | Bordes #BCD0E1, filas de sección en azul claro #DCEAF7 y columna de etiquetas en #EEF6FE, siempre con texto negro |
| Encabezado de las cartas (F-02, F-03) | Membrete «IDC Sistemas Eléctricos» | **Sin membrete de IDC**, porque la carta la firma el cliente y el original no lo tiene. Solo queda un código discreto a la derecha: «F-02 · Folio · v» |
| Encabezado de los documentos IDC (F-04, F-05, F-06) | «IDC Sistemas Eléctricos» | Membrete IDC con el lema «INGENIERÍA \| DISEÑO \| INSTALACIÓN \| AUTOMATIZACIÓN» (tomado de las listas de requisitos de IDC), línea azul, código y folio |
| Pie | «Generado por Conecta Ágil · Página N» | Igual en todas; F-04 a F-06 agregan «IDC Sistemas Eléctricos · Hermosillo, Sonora, México» |
| Estilos sobrantes | La plantilla base traía decenas de estilos y temas sin usar | Archivos limpios (~12 KB contra ~39 KB) |

## 3. Comparación con los formatos del expediente
### F-02 Carta poder ↔ expediente, p. 27 (ver `COMPARACION_F-02_vs_EXPEDIENTE_p27.png`)
| Elemento del original | v1 (ChatGPT) | v2 |
|---|---|---|
| Lugar y fecha arriba a la derecha, en mayúsculas | Sí | Sí (`{{lugar}}, A {{fecha}}` en mayúsculas) |
| «COMISIÓN FEDERAL DE ELECTRICIDAD» y «A QUIEN CORRESPONDA:» | Usaba «Presente» | **Igual al original** |
| «ASUNTO: CARTA PODER» a la derecha | No | **Sí** |
| «Por medio de la presente y bajo protesta de decir verdad yo… en mi carácter de persona física, otorgo poder legal al C. … para que en mi nombre y en representación efectúe el trámite de interconexión con la dependencia Comisión Federal de Electricidad.» | Texto distinto; agregaba RFC, cargo, RPU, domicilio, tecnología y kW | **Mismo texto del original**, en mayúsculas. El carácter es una marca: `{{cliente.tipo_persona}}` |
| Despedida «Agradeciendo de antemano…» | No | **Sí** |
| Tabla de firmas 2×2 **con bordes**: nombre, «PERSONA FÍSICA», «OTORGA PODER / ACEPTA PODER»; testigos «NOMBRE Y FIRMA / TESTIGO» | Sin bordes; agregaba líneas de identificación | **Igual al original** |

### F-03 Carta poder simple UIIE ↔ requisito 15 de la lista UIIE
«Del propietario de la instalación al gestor, para tramitar el certificado de cumplimiento». Usa la misma estructura que F-02. El cuerpo identifica la instalación (domicilio y RPU) y las facultades: gestionar y atender la inspección, firmar los formatos para el certificado y recibirlo. La nota de la lista dice que los formatos del certificado los firma el propietario o el gestor con poder, y eso queda cubierto.

### F-04 Ficha ↔ requisitos 12, 13 y 17 de la lista UIIE
| Requisito | Lo que pide la lista | v1 | v2 |
|---|---|---|---|
| 17 | Número de servicio, tarifa y datos del titular | Sí | Sí |
| 12 | Nombre, correo y teléfono del responsable del cliente, designado por el representante legal | Sí, sin la nota | Sí, con la nota |
| 13 | **Nombre y correo** del Enlace Empresarial de CFE | Solo «Contacto» | **Nombre y correo** (`{{enlace_cfe}}` y `{{enlace_cfe_correo}}`) |

### F-05 Memoria ↔ expediente, pp. 37–41
La v1 tenía 7 apartados propios. La v2 usa **el mismo índice del original**:
- 1 Dimensionamiento: 1.1 Selección de módulos, 1.2 Consumo diario, 1.3 Potencia requerida, 1.4 Cantidad de paneles, 1.5 Producción energética, 1.6 Cálculo y selección de inversor, 1.7 Relación DC/AC.
- 2 Configuración del arreglo FV: 2.1 Distribución en MPPT, 2.2 Distribución en strings.

Cada apartado indica en una línea qué contiene en el original. Se agregó «Ingeniero responsable» porque aparece en el encabezado del original.

### F-06 Carátula ↔ orden del expediente
Se mantiene el ciclo `{{#lista}}…{{/lista}}` en una sola fila. Se agregó la nota de que los documentos se listan **en el orden en que se integran en el expediente**.

## 4. Cambios en las marcas (actualizar `templates/marcas.catalogo.json` antes de cargar)
- **Nuevas en v2:**
  - `{{cliente.tipo_persona}}` (F-02, F-03): valor «PERSONA FÍSICA» o «PERSONA MORAL».
  - `{{enlace_cfe_correo}}` (F-04, sensible).
  - `{{ingeniero.nombre}}` (F-05).
- **Quitadas de F-02** para igualar el original: `cliente.rfc`, `apoderado.cargo`, `rpu`, `servicio.domicilio`, `tecnologia`, `capacidad_kw`, `tramite` y las cuatro `*.identificacion`.
  - **Atención:** el catálogo marca `tramite` como requerida en F-02. Hay que cambiar las requeridas de F-02 a `cliente.nombre` y `apoderado.nombre`; si no, el validador dará una advertencia.
- **Quitadas de F-03:** las cuatro `*.identificacion` (el original no las lleva en la carta; las INE van como anexos, requisitos 6–8).
- F-04, F-05 y F-06 conservan todas sus marcas de v1.
- Las marcas de F-02 y F-03 llevan **mayúsculas por formato** (propiedad de Word), igual que el original. En el XML siguen en minúsculas, así que el validador no se ve afectado, y los datos llenados saldrán en mayúsculas.

Detalle completo en `MAPEO_MARCAS_POR_FORMATO_v2.csv`.

## 5. Verificación final (resultado en `RESULTADO_QA_v2.json`)
| Prueba | F-02 | F-03 | F-04 | F-05 | F-06 |
|---|---|---|---|---|---|
| Esquema OOXML válido | ✔ | ✔ | ✔ | ✔ | ✔ |
| Marcas partidas | 0 | 0 | 0 | 0 | 0 |
| Llaves sueltas fuera de marcas | 0 | 0 | 0 | 0 | 0 |
| Texto fijo en negro y marcas en azul (run por run) | ✔ | ✔ | ✔ | ✔ | ✔ |
| Fuentes | Arial | Arial | Arial | Arial | Arial |
| Ciclos balanceados | — | — | — | — | 1/1, misma fila |
| Macros e imágenes | 0 | 0 | 0 | 0 | 0 |
| Páginas | 1 | 1 | 1 | 2 | 1 |
| Marcas distintas | 9 | 11 | 16 | 6 | 15 |

**Pendiente** (igual que en v1): probar con docxtemplater real en el repositorio (`npm run plantillas:check` y E2E). Aprobación de la redacción por IDC: el aviso azul debe borrarse en cuanto IDC apruebe el texto.
