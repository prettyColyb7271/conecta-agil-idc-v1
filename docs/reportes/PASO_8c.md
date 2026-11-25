# PASO 8c — F-01 como plantilla PDF gestionable

## Entrega

- Se generó `templates/F-01_gestionable.pdf` desde el PDF oficial sin reemplazarlo.
- Se agregaron campos AcroForm con marcas `grupo.campo` del catálogo de F-01.
- La generación con `pdf-lib` conserva el PDF oficial, rellena los campos y mantiene el documento editable.
- Se agregó validación de página única y cantidad de campos a `npm run plantillas:check`.
- Se agregó `docs/muestras/F-01_grilla.pdf` y la guía `docs/F-01_PAQUETE_PARA_CLAUDE.md`.

## Validación

- `npm run formats:f01-template`: OK.
- `npm run plantillas:check`: OK (5 DOCX + F-01 PDF).
- `npm run lint`: OK.
- `npx tsc --noEmit`: OK.
- Regresión aislada posterior: OK.
  - 94/94 general, 33/33 documentos, 13/13 Paso 6, 27/27 gestores, 37/37 G0–G2, 52/52 G3–G7 y 10/10 seguridad.
