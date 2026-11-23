# PASO 6 — Gates y formatos

## 1. Alcance

Se implementaron los gates G0–G7, las transiciones con autorización de Gestor IDC,
evidencias externas, auditoría, reglas de bloqueo/reapertura y generación versionada
de F-01 a F-06. El Paso 6b (enlace de un solo uso para contraseña) no se inició.

El único archivo incorporado desde `08_EXPEDIENTE_MT` es
`public/plantillas/Solicitud para la interconexion.pdf`, usado como base de F-01.
No se incorporó ningún documento de expediente.

## 2. Cambios principales

- `GET/POST /api/expedientes/:id/gates`: consulta, cierre, reapertura y evidencias externas.
- Cierre secuencial G0–G7 con requisitos y evidencias obligatorias.
- Admin de seguridad recibe 403; cliente solo consulta su expediente.
- Separación de funciones PA-02: quien sube una versión no puede validarla.
- Cambio material en `central` invalida la versión generada de F-01 (PA-05).
- `POST /api/expedientes/:id/formats` genera PDFs versionados en el StorageAdapter local.
- F-01 superpone datos sobre el PDF original sin reemplazar su texto.
- F-02–F-06 son plantillas generadas y llevan aviso de aprobación pendiente de IDC.
- Auditoría registra hashes, versiones y códigos, nunca contenido documental.

## 3. Validación estática

### `npx tsc --noEmit`

```text
Process exited with code 0.
```

### `npm run lint`

```text
> conecta-agil@0.1.0 lint
> eslint

Process exited with code 0.
```

## 4. Builds

Se ejecutaron secuencialmente para no competir por `.build-mode`:

```text
APP_MODE=demo NEXT_PUBLIC_MODO=demo npm run build
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages (25/25)

APP_MODE=local NEXT_PUBLIC_MODO=local npm run build
✓ Compiled successfully
✓ Running TypeScript
✓ Generating static pages (25/25)
```

La aplicación expone las nuevas rutas:

```text
ƒ /api/expedientes/[id]/formats
ƒ /api/expedientes/[id]/gates
```

## 5. Suite E2E aislada

Comando ejecutado:

```text
npm run test:e2e:isolated
```

Salida completa de resultados:

```text
Migraciones aplicadas. schemaVersion=3
users=4, requirements=28, expedientes=1, gates=8
RESULTADO: 95 ✅ / 0 ❌
RESULTADO: 33 ✅ / 0 ❌
PASO 6: 6 ✅ / 0 ❌
```

Los casos nuevos verifican:

- consulta de los ocho gates;
- rechazo de cierre incompleto de G1 con 409;
- rechazo de formato desconocido con 400;
- aislamiento del administrador de seguridad con 403.

## 6. Base principal y servidor final

La BD principal se dejó limpia con reset, migración y semilla ficticia:

```text
schemaVersion=3
users=4
requirements=28
expedientes=1
gates=8
documents=0
audit_events=0
```

El servidor local queda iniciado con:

```text
APP_MODE=local
NEXT_PUBLIC_MODO=local
next start -p 3140
```

## 7. Decisiones y pendientes

- Los textos finales de F-02–F-06 siguen marcados para aprobación de IDC.
- La comprobación de vigencia legal del texto heredado de F-01 queda como confirmación
  documental; el texto original del PDF no se modifica.
- El enlace de un solo uso para contraseña queda explícitamente fuera de este paso y
  se implementará únicamente como Paso 6b después de aprobación.
