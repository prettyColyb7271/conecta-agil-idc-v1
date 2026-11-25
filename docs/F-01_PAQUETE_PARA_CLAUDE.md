# F-01 — paquete para Claude

## Fuente y preservación

`templates/F-01_base.pdf` es el PDF oficial de CFE. `templates/F-01_gestionable.pdf` conserva sus páginas y contenido original y agrega únicamente widgets AcroForm sin JavaScript. La aplicación carga el PDF gestionable cuando está disponible y usa el PDF base como respaldo.

## Marcas

Los nombres AcroForm siguen la convención única `grupo.campo`: `solicitante.tipo_persona`, `solicitante.nombre_razon_social`, `solicitante.rfc`, `solicitante.domicilio`, `contacto.telefono`, `contacto.correo`, `servicio.rpu`, `servicio.tarifa`, `servicio.nivel_tension_suministro`, `central.tecnologia`, `central.capacidad_kw` y `central.utm`.

Los datos se derivan de `data_json.solicitante`, `data_json.servicio_actual` y `data_json.central`; el RFC se presenta en mayúsculas y la capacidad conserva el valor capturado. Un dato ausente se deja vacío en el campo gestionable.

## Reglas

- Solo PDF de una página, tamaño y contenido de CFE conservados.
- No se permite JavaScript ni acciones embebidas.
- No se usan macros ni se sobrescribe el PDF oficial.
- El PDF generado mantiene los campos editables; no se aplana en esta etapa.
- La grilla de coordenadas está en `docs/muestras/F-01_grilla.pdf`.

## Validación

`npm run formats:f01-template` regenera la plantilla desde el PDF base. `npm run plantillas:check` verifica las cinco plantillas Word y la cantidad de campos AcroForm de F-01.
