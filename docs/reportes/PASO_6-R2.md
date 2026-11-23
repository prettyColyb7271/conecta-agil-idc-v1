# PASO 6-R2 — Escaneo tras G1, corrección material y migración segura

## Cambios realizados

- Con G1 cerrado se permite únicamente la carga IDC de un escaneo cuyo `sourceVersionId` pertenece al requisito y a una versión en `pendiente_firma_presencial`.
- La firma presencial se registra antes o después de cargar el escaneo y conserva el vínculo con el documento.
- Se expuso `PATCH /api/expedientes/:id` para Gestor IDC con `{ data, reason }`; el motivo es obligatorio y se audita.
- Un cambio material invalida F-01 y F-02, incluidos sus escaneos y versiones, reabre G2 y bloquea G3–G7.
- El pie de F-01 contiene folio, versión de datos, SHA-256 corto y la marca de generación.
- El runner aplica la migración 004 con `foreign_keys` desactivado únicamente durante la recreación, valida referencias y las reactiva.
- El flujo completo se integra en `test:e2e:isolated`.
- Las muestras F-01, F-04 y F-06 se regeneraron desde PDFs obtenidos por el flujo real G0–G2; F-02 conserva la muestra estructurada aprobada mientras el archivo estaba bloqueado por OneDrive durante la sustitución.

## Validación

Comandos ejecutados:

```text
npm run lint                         ✅
npx tsc --noEmit                    ✅
npm run build                       ✅
npm run test:e2e:isolated           ✅
```

Resultados de la suite aislada:

```text
suite general       95/95 ✅
suite documental    33/33 ✅
suite Paso 6        12/12 ✅
suite gestores      33/33 ✅
flujo G0–G2         37/37 ✅
migración 004       ✅ con documento y observación existentes
```

El flujo completo verifica:

- aceptación de privacidad y cierre G0;
- cierre de G1 con los 11 requisitos;
- generación de F-01, F-02, F-04 y F-06;
- preservación de los content streams originales de CFE;
- impresión, firma presencial y escaneo posterior a G1;
- verificación por un segundo Gestor IDC;
- cierre de G2;
- corrección material posterior con reapertura de G2;
- bloqueo de G3–G7 e invalidación de F-01/F-02;
- reapertura de G1 con requisito observado.

La BD de la suite es temporal y se elimina al terminar. La BD principal se resembra limpia antes de dejar el servidor local.
