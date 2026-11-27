# Paso PR1: integración local para revisión

## Rama y commits

- Rama local: `integrar-pr-1`, creada a partir del PR #1, sin merge ni push.
- Base del PR: `bb4f054cc4364713dbab8978990d2008659693e4` (`desarrollo`).
- PR de Gabriel: `2dfd8fc96145f960e1bc7c1df290bd9d00594236`.
- Correcciones: `9f464eed38028a89b5a23fcc53c0eeebffe5cde9`.
- Este reporte se registra en un commit posterior; consultar `git log` para su identificador.

## Cambios

- Los requisitos U reutilizables se ocultan solo cuando están validados o se justificó que no aplican. U06 pendiente u observado permanece visible y admite carga en G6.
- El portal distingue la firma en revisión del escaneo verificado y no presenta como firmado un requisito simplemente validado.
- El semáforo cuenta los requisitos de la etapa correspondiente y señala observaciones. Si existen requisitos pendientes de otras etapas, no afirma que no haya faltantes.
- El registro y la carga del acuse exigen R10 y R11 validados. Ambas vías responden 409 sin registrar el evento; la carga rechazada revierte la transacción e intenta retirar el archivo almacenado.
- Se añadieron pruebas del portal, el semáforo, la firma y ambas vías del acuse.

### Archivos de corrección

- `app/api/expedientes/[id]/documents/route.ts`
- `app/portal/formatos/LocalDocumentos.tsx`
- `lib/data/documents.ts`
- `lib/data/gates.ts`
- `lib/portal-cliente.ts`
- `lib/semaforo.ts`
- `tests/e2e/isolated.mjs`
- `tests/e2e/regresiones-pr1.ts`
- `tests/e2e/supervisor-flujo-g3-g7.mjs`
- `docs/reportes/PASO_PR1.md`

Los 27 archivos originales del PR se pueden consultar con `git diff --name-status desarrollo..2dfd8fc`.

### Documentación del workspace

Se actualizaron `DECISIONES_DEL_EQUIPO_2026-11-23.md` y `ESPECIFICACION_PILOTO_MT_FV.md` en `06_DOCUMENTACION_Y_PROMPTS`, incluyendo la tabla de gates y el orden del ingreso. **Esa carpeta está fuera del repositorio Git:** los cambios existen en el workspace, pero no forman parte de la rama ni de sus commits y deben compartirse o versionarse por separado.

## Pruebas

Ejecutadas en una instantánea separada de la rama, con los archivos de corrección verificados por hash contra el proyecto, `APP_MODE=local` y bases temporales. No se usaron el puerto 3140 ni la base de datos real.

| Comando | Resultado |
|---|---|
| `npm run lint` | Correcto |
| `npx --no-install tsc --noEmit` | Correcto |
| `npm run plantillas:check` | Correcto: cinco DOCX y F-01 PDF |
| `npm run build` | Correcto, modo local |
| `npm run test:e2e:isolated` | Correcto: 288 comprobaciones de los supervisores, migración y pruebas focalizadas del portal y semáforo |

La suite comprueba U06 en el HTML del portal y los estados de firma, además de los dos caminos de ingreso del acuse. No sustituye una revisión interactiva en navegador.

## Pendiente

- Revisión del equipo de la rama local, de la regla de negocio y de la interfaz.
- Compartir o versionar por separado los dos documentos del workspace externos al repositorio.
- Decidir, tras la revisión y con autorización expresa, cómo publicar e integrar los cambios. No se ha hecho push ni merge.
