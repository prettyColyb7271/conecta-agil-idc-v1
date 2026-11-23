# PASO 5 — Documentos y revisión por Gestor IDC

## 1. Alcance implementado

- Carga local por requisito mediante `multipart/form-data`.
- Solo PDF, JPG y PNG con validación de magic bytes.
- Límite de 20 MB por archivo (`413`).
- Storage local en `<LOCAL_DATA_DIR>/documents/<documentId>/<versionId>.<ext>`.
- Nombres originales nunca se usan como ruta.
- Versiones inmutables con `sha256`, tamaño, autor y nombre original.
- Descarga autorizada con `Content-Disposition: attachment` y `X-Content-Type-Options: nosniff`.
- Revisión IDC: validar, observar y no aplica justificado.
- Observaciones `cliente` e `interno_idc`.
- Notificaciones a cliente e IDC responsable.
- Auditoría sin contenido documental.
- Demo sin escritura en disco.

## 2. Autorización y estados

- Cliente: solo expedientes propios y requisitos cuyo catálogo integra `Cliente`, `Cliente/IDC` o `IDC/Cliente`.
- Gestor IDC: todos los expedientes y cualquier requisito.
- Administrador de seguridad: `403` para documentos y expedientes.
- La carga se bloquea con `409` cuando G1 está cerrado.
- Nueva versión después de una validación devuelve el requisito a `cargado` y marca la nueva versión con `change_reason = invalidado_por_cambio`.
- Las observaciones internas no se incluyen en la respuesta del cliente.

## 3. Validación estática y builds

```text
npm run lint
> conecta-agil@0.1.0 lint
> eslint
Código de salida: 0
```

```text
npx tsc --noEmit
Código de salida: 0
```

Build local:

```text
Build mode: local
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
Código de salida: 0
```

Build demo:

```text
Build mode: demo
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages
Código de salida: 0
```

## 4. Regresión demo

Servidor demo temporal en `http://localhost:3141`:

```json
{"Home":200,"Portal":200,"DemoFolio":true}
```

La demo mostró `IDC-2026-021` y no creó datos locales.

## 5. Suite E2E aislada

Comando:

```text
npm run test:e2e:isolated
```

La variante ejecutó migración y semilla en una carpeta temporal, levantó `next start` en `3199`, ejecutó la suite y eliminó la carpeta temporal.

Salida inicial real:

```text
Migraciones aplicadas. schemaVersion=2
{
  "users": 4,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}
```

Casos PASO 5 verificados:

```text
✅ PDF válido → 201 versión 1
✅ sha256 de carga correcto
✅ EXE renombrado a PDF → 400
✅ archivo mayor de 20 MB → 413
✅ descarga devuelve bytes y cabeceras seguras
✅ descarga attachment + nosniff
✅ cliente B no descarga documento de A
✅ admin no descarga documentos
✅ IDC valida requisito
✅ observación interna creada
✅ cliente no ve observación interna
✅ observar sin motivo → 400
✅ nueva versión invalida revisión previa y vuelve a cargado
✅ carga con G1 cerrado → 409
```

La suite completa terminó con:

```text
RESULTADO: 80 ✅  /  0 ❌
```

## 6. Estado final de la BD y servidor

La BD principal se dejó limpia con reset, migración y semilla:

```text
Base SQLite local eliminada.
Migraciones aplicadas. schemaVersion=2
{
  "users": 4,
  "requirements": 28,
  "expedientes": 1,
  "gates": 8,
  "password": "ConectaLocal-2026!",
  "fictitious": true
}
```

Health final:

```json
{
  "modo": "local",
  "db": "sqlite",
  "ok": true,
  "schemaVersion": 2,
  "counts": {
    "users": 4,
    "account_requests": 0,
    "sessions": 0,
    "expedientes": 1,
    "expediente_assignments": 1,
    "requirement_catalog": 28,
    "expediente_requirements": 28,
    "documents": 0,
    "document_versions": 0,
    "observations": 0,
    "gates": 8,
    "external_events": 0,
    "notifications": 0,
    "audit_events": 0,
    "export_jobs": 0
  }
}
```

Servidor local final activo:

```text
http://localhost:3140
http://192.168.56.1:3140
```

Verificación HTTP:

```json
{
  "portalStatus": 200,
  "digest": false
}
```

## 7. Commit

Pendiente de crear:

```text
Paso 5: documentos y revisión por Gestor IDC
```
