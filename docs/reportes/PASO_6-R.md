# PASO 6-R — flujo G0 → G1 → formatos → firma → G2

## Alcance corregido

Se rehízo el flujo para que la demostración no dependa de trucos ni de modificar
directamente la BD:

1. El cliente acepta el aviso de privacidad.
2. IDC cierra G0.
3. IDC integra y valida R01–R11 y cierra G1.
4. IDC genera F-01, F-02, F-04 y F-06.
5. IDC marca los formatos para firma, registra lugar/fecha/firmantes y carga los
   escaneos ligados al `version_id` y al SHA-256 del borrador.
6. Otro Gestor IDC verifica cada escaneo.
7. El sistema permite cerrar G2 únicamente con ambos escaneos verificados.

El Paso 6b sigue fuera de alcance.

## Plantilla y editabilidad

- La plantilla aprobada se encuentra en `templates/F-01_base.pdf`, fuera de `public/`.
- `templates/F-01_campos.json` contiene las coordenadas, página, tamaño y ancho
  máximo de cada campo.
- `scripts/generate-f01-grid.ts` genera una grilla de calibración cada 20 puntos.
- F-01 no depende de AcroForm: el PDF original se conserva y los valores se
  superponen únicamente en las coordenadas de los espacios en blanco.
- Si un valor no cabe, se reduce/trunca y se registra un aviso en auditoría.
- El pie incluye versión de datos, folio, hash corto y “Generado por Conecta Ágil”.
- F-02, F-04 y F-06 son plantillas PDF estructuradas, con etiquetas en español,
  tablas y espacios de firma. El texto legal está explícitamente marcado como
  `[TEXTO PENDIENTE DE APROBACIÓN IDC]`.

Para personalizar las plantillas: ajustar `F-01_campos.json` para posiciones y
`lib/data/formats.ts` para textos, filas y estilos de F-02/F-04/F-06. Las muestras
ficticias están en `docs/muestras/`:

- `F-01_muestra.pdf`
- `F-02_muestra.pdf`
- `F-04_muestra.pdf`
- `F-06_muestra.pdf`
- `F-01_grilla.pdf`

## Migración 004

`004_flujo_firma_privacidad.sql` agrega:

- aceptación del aviso (`privacy_accepted_at`, versión y usuario);
- `source_version_id` para vincular escaneo y borrador;
- estados de requisito `pdf_generado`, `pendiente_firma_presencial`,
  `escaneo_recibido` y `escaneo_verificado_idc`.

Validación real:

```text
npm run db:migrate
Migraciones aplicadas. schemaVersion=4

npm run db:migrate
Migraciones aplicadas. schemaVersion=4

npm run db:seed
users=4, requirements=28, expedientes=1, gates=8
```

La migración se probó tanto desde una BD nueva como sobre la BD principal que ya
tenía datos del Paso 5.

## Reglas implementadas

- G0 sin privacidad: `409`.
- Generación de formatos antes de G1 cerrado: `409`.
- Cliente generando o cerrando: `403`.
- F-01/F-02 se guardan como `pdf_generado`, nunca como `cargado`.
- Regenerar conserva la versión anterior con `change_reason =
  invalidado_por_cambio`.
- Imprimir cambia el requisito a `pendiente_firma_presencial`.
- El escaneo requiere `sourceVersionId`, conserva `source_version_id` y queda en
  `escaneo_recibido`.
- Verificar exige otro Gestor IDC; cambia a `escaneo_verificado_idc`.
- G2 exige R01 y R07 en `escaneo_verificado_idc` y evento
  `firma_presencial`.
- G3 exige evidencia de ingreso/acuse con documento.
- Cambios materiales en capacidad, RPU, RFC, nombre/razón social, tensión o tarifa
  invalidan F-01, devuelven R01 a `requerido`, reabren G2 y bloquean los posteriores.
- La corrección material posterior a G1 la realiza un Gestor IDC con motivo
  mediante el flujo server-only de corrección.
- Reabrir Gn deja Gn abierto, bloquea todos los posteriores y conserva el historial.
  Reabrir G1 exige una lista de requisitos que regresan a `observado`.

## Pruebas

```text
npx tsc --noEmit
Process exited with code 0

npm run lint
Process exited with code 0

APP_MODE=demo NEXT_PUBLIC_MODO=demo npm run build
✓ Compiled successfully
✓ Generating static pages (25/25)

APP_MODE=local NEXT_PUBLIC_MODO=local npm run build
✓ Compiled successfully
✓ Generating static pages (25/25)

npm run test:e2e:isolated
RESULTADO: 95 ✅ / 0 ❌
RESULTADO: 33 ✅ / 0 ❌
PASO 6: 12 ✅ / 0 ❌
RESULTADO: 33 ✅ / 0 ❌
```

Los 12 casos de Paso 6 verifican privacidad, cierre G0, bloqueo de G1,
generación posterior a G1, aislamiento del cliente, plantilla fuera de `public` y
403 del administrador. También se reintegró `supervisor-gestores.mjs`:
`33/33`.

Smoke HTTP demo:

```text
health=200 portal=200
```

Smoke HTTP local final:

```text
health=200 home=200
schemaVersion=4
documents=0
audit_events=0
gates=8
```

## Estado final

- BD principal limpia y resembra con datos ficticios.
- `next start -p 3140` local activo.
- No existe `public/plantillas`.
- No se incorporó ningún documento de expediente real o anonimizado.
