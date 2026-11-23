# PASO 6c — Plantillas Word para formatos IDC

Se incorporó generación DOCX con docxtemplater y pizzip para F-02, F-03, F-04
y F-06. F-01 permanece PDF; los escaneos siguen ligados mediante
`sourceVersionId`. Las plantillas se validan como ZIP DOCX, sin macros,
etiquetas partidas y con límite de 5 MB. La migración 006 versiona plantillas
activas y sus hashes, y el Gestor IDC puede listar, cargar y descargar
versiones.

Validación: `npm run plantillas:check`, `npx tsc --noEmit`, lint, build y las
suites E2E existentes. La conversión opcional a PDF no es requerida: si se
instala `soffice` puede realizarse fuera del flujo de generación.
