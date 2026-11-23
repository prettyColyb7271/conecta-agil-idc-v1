# PASO 5c — Confidencialidad y validación documental

## 1. Correcciones aplicadas

- `observed_reason` solo se guarda para observaciones con visibilidad `cliente`.
- Una observación `interno_idc` no cambia el estado visible del requisito; se conserva como nota interna únicamente.
- Las respuestas de revisión para clientes ocultan `observed_reason` interno y filtran observaciones `interno_idc`.
- La página del portal recibe únicamente observaciones visibles para el cliente.
- `validate` exige `version_id`; sin documento devuelve `409 No hay documento cargado para validar`.
- Validar, observar y no aplicar con G1 cerrado devuelven `409`.
- El endpoint de carga verifica `Content-Length` antes de llamar a `request.formData()`.
  - Ausente: `411`.
  - Mayor de 21 MB: `413`.
  - Se conserva la validación posterior de `file.size` a 20 MB.
- La suite aislada ya no usa `shell: true`; ejecuta directamente el CLI de `tsx` y elimina el warning `DEP0190`.

La decisión de no cambiar el estado visible ante una nota interna evita que una observación privada de IDC se filtre indirectamente por el estado del requisito. La nota queda disponible para IDC mediante la consulta autorizada, mientras el cliente conserva el estado anterior y no recibe el motivo.

## 2. Suite integrada

Se integró `tests/e2e/supervisor-documentos.mjs` en `npm run test:e2e:isolated`. La prueba levanta su propia instancia en `3198` y usa una BD temporal independiente.

Comando:

```text
npm run test:e2e:isolated
```

Suite de regresión PASOS 1–5:

```text
RESULTADO: 80 ✅  /  0 ❌
```

Suite adversarial documental:

```text
RESULTADO: 33 ✅ / 0 ❌
```

Casos nuevos verificados:

```text
✅ Content-Length excesivo → 413 sin parsear multipart
✅ validar requisito SIN documento → 400/409
✅ cliente NO ve observación interna (ni en observed_reason)
✅ portal del cliente NO contiene nota interna
✅ validar con G1 cerrado → 409
```

Salida relevante completa de la suite documental:

```text
== carga
  ✅ cliente sube R06 (integra Cliente) → 201 + sha256 correcto
  ✅ cliente sube R02 (integra IDC) → 403
  ✅ exe renombrado .pdf → 400
  ✅ PNG con mime application/pdf → 400
  ✅ HTML con mime text/html → 400
  ✅ cliente B sube a expediente de A → 404
  ✅ admin sube → 403
  ✅ requirementCode inválido (../R06) → 400
  ✅ PDF de 21 MB → 413
  ✅ Content-Length excesivo → 413 sin parsear multipart
  ✅ nombre con traversal/comillas/CRLF → 201
== descarga
  ✅ cliente descarga su doc → mismos bytes
  ✅ cabeceras attachment + nosniff
  ✅ filename saneado (sin / \ comillas internas ni CRLF)
  ✅ cliente B descarga doc de A → 404
  ✅ admin descarga → 403
  ✅ cliente pide versión específica → 403
  ✅ IDC descarga versión específica → 200
  ✅ sin sesión → 401/403
== revisión
  ✅ validar requisito SIN documento → 400/409
  ✅ cliente no puede validar → 403
  ✅ observar sin motivo → 400
  ✅ visibilidad inválida → 400
  ✅ acción inválida → 400
  ✅ cliente ve observación visible
  ✅ cliente NO ve observación interna (ni en observed_reason)
  ✅ portal del cliente NO contiene nota interna
  ✅ cliente B no lista requisitos de A → 404
  ✅ nueva versión tras validar → requisito 'cargado', 2 versiones
  ✅ validar con G1 cerrado → 409
== disco
  ✅ ningún archivo con nombre original
  ✅ no se escribió nada fuera de documents/ por traversal
  ✅ archivo de 21 MB no quedó en disco

RESULTADO: 33 ✅ / 0 ❌
```

## 3. Validación estática

```text
npx tsc --noEmit
Código de salida: 0

npm run lint
> conecta-agil@0.1.0 lint
> eslint
Código de salida: 0
```

## 4. Build

```text
npm run build
Build mode: local
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
Código de salida: 0
```

## 5. Seguridad documental

- No se llama a `formData()` cuando `Content-Length` supera el margen de 21 MB.
- Los archivos de 21 MB no quedan en disco.
- No se usan nombres originales como rutas.
- El traversal, CRLF y comillas se sanea únicamente para `Content-Disposition`.
- El contenido binario sigue validándose por magic bytes.
- Un cliente no puede leer documentos de otro expediente.
- Admin seguridad no puede cargar ni descargar documentos.

## 6. Estado de base y servidor

La suite usa una BD temporal y la elimina al finalizar. La BD principal no se modifica durante la prueba aislada.

El servidor local que debe quedar para la siguiente verificación continúa en:

```text
http://localhost:3140
```

## 7. Commit

Pendiente de crear:

```text
Paso 5c: confidencialidad de observaciones y validación de documentos
```
