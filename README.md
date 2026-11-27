# Conecta Ágil IDC

Piloto para la gestión trazable de expedientes de interconexión fotovoltaica
en media tensión. La plataforma conserva documentos, versiones, revisiones,
firmas, eventos externos y el avance de los gates G0-G7.

## Accesos

- **Demo pública en Vercel:** <https://conecta-agil-idc.vercel.app>
- **Repositorio privado:** <https://github.com/prettyColyb7271/conecta-agil-idc-v1>
- **Rama de trabajo:** `desarrollo`
- **Rama estable:** `main`

La demo pública usa `APP_MODE=demo`, datos ficticios y adaptadores mock. No
debe usarse para documentos reales, contraseñas reales ni pruebas de correo.
La aplicación local es la que contiene SQLite, almacenamiento local y el
flujo funcional completo del piloto.

## Alcance implementado

### Roles y acceso

- **Cliente:** registro, captura de datos, carga y corrección de documentos,
  consulta del avance, alertas y documentos externos que le corresponden.
- **Gestor IDC (`coordinador_idc`):** administra expedientes, revisa
  requisitos, registra eventos CFE/UIIE, genera formatos y opera los gates.
- **Administrador de seguridad (`admin_seguridad`):** administra cuentas,
  roles, sesiones, MFA, recuperación y bitácora. No gestiona expedientes ni
  valida gates técnicos.
- No existe un rol operativo separado de Gestor CFE en el piloto.

Las rutas protegidas validan sesión, vencimiento, revocación y rol en el
servidor. El alta y restablecimiento de Gestores IDC usa enlaces de un solo
uso. El administrador de seguridad requiere MFA TOTP; la plataforma también
soporta MFA opcional para otros usuarios.

### Flujo del expediente

- G0-G2: registro, datos del expediente, requisitos R01-R11, observaciones,
  versiones y firma presencial.
- G3: ingreso a CFE, medio, fecha, número de solicitud y acuse físico sellado.
- G4: oficio resolutivo, vigencia, resultado, características y subgate
  opcional de estudio, presupuesto o aportación.
- G5: contrato de interconexión firmado como evidencia externa.
- G6: requisitos U01-U17, reutilización versionada, visita y certificado UIIE.
- G7: medidor, interconexión física, alta comercial y cierre revisado por otro
  Gestor IDC.
- Un gate G3-G7 no se cierra sin la evidencia externa que corresponda.
- Los vencimientos generan alertas al consultar; no ejecutan cambios
  automáticos.

### Documentos

- F-01: PDF oficial de CFE con campos AcroForm gestionables y coordenadas
  documentadas.
- F-02, F-03, F-04, F-05 y F-06: plantillas Word editables con marcas
  versionadas, catálogo único y datos ficticios de prueba.
- Se conservan hashes, versiones y trazabilidad de las plantillas.
- La captura guiada de la memoria F-05 sigue pendiente; U09 se carga
  manualmente por ahora.

### Seguridad, correo y auditoría

- MFA TOTP, códigos de respaldo, cifrado de secretos MFA y prevención de
  reutilización de códigos.
- Recuperación de acceso con enlaces de un solo uso, expiración, revocación de
  sesiones y bitácora.
- Transporte de correo `file` para pruebas y `resend` para el entorno
  configurado. Las pruebas automáticas nunca envían correos reales.
- Los secretos viven únicamente en `.env.local`; nunca deben entrar en
  README, prompts, reportes, logs o commits.

## Ejecutar en local

Requiere Node.js 26 y PowerShell en Windows.

```powershell
Set-Location 'C:\ruta\al\repositorio\09_MAIN_CODE_V1\Conecta-agil-fase1'
$env:APP_MODE = 'local'
$env:NEXT_PUBLIC_MODO = 'local'
npm install
npm run db:migrate
npm run dev
```

`db:seed` es solo para bases de pruebas aisladas, nunca para la base real.

Para la compilación local en el puerto 3140:

```powershell
$env:APP_MODE = 'local'
$env:NEXT_PUBLIC_MODO = 'local'
npm run build
npm run start:local
```

No se usa `-H 0.0.0.0`: Next escucha en las interfaces disponibles y esa opción altera la dirección que el servidor usa para validar el origen. Para un túnel, configura explícitamente su origen en `ALLOWED_ORIGINS`.

Health check:

```text
http://localhost:3140/api/health
```

`LOCAL_DATA_DIR` permite aislar una ejecución y mantener la base fuera de
OneDrive:

```powershell
$env:LOCAL_DATA_DIR = 'C:\ruta\temporal\conecta-agil-e2e'
```

### Usuarios ficticios locales

Después de `npm run db:migrate` y `npm run db:seed`:

| Perfil | Correo |
|---|---|
| Cliente | `cliente.demo@example.invalid` |
| Gestor IDC | `coordinador.demo@example.invalid` |
| Segundo Gestor IDC | `idc2.demo@example.invalid` |
| Administrador de seguridad | `seguridad.demo@example.invalid` |

La contraseña de semilla es `ConectaLocal-2026!` y solo sirve para el entorno
local ficticio. El administrador debe completar el enrolamiento MFA antes de
usar sus funciones protegidas.

## Pruebas y validación

Comandos mínimos:

```powershell
npm run lint
npx tsc --noEmit
npm run plantillas:check
npm run test:e2e:isolated
```

La regresión aislada cubre:

- inicio y cierre de sesión, cookies, vencimiento, revocación y aislamiento
  entre clientes;
- permisos de cliente, Gestor IDC y administrador de seguridad;
- registro, aprobación de cuentas y enlaces de un solo uso;
- MFA TOTP, códigos de respaldo, recuperación, bitácora y exportación CSV;
- documentos R01-R11, versiones, observaciones y firmas;
- generación y validación de F-01 a F-06;
- flujo G0-G2 y flujo completo G3-G7;
- evidencias externas, alertas de vigencia, U01-U17 y cierre de expediente.

La suite adversarial `tests/e2e/supervisor-seguridad-ataque.mjs` forma parte de
`test:e2e:isolated`; usa datos ficticios aislados y devuelve código distinto de
cero si falla alguna comprobación.

## Plan de Zoho

Conecta Ágil sigue siendo la fuente de verdad del expediente, los documentos,
las revisiones y las evidencias. Zoho no debe almacenar documentos sensibles
del piloto ni reemplazar la trazabilidad local.

### Alcance previsto

1. **Zoho Projects:** un proyecto gratuito, `Conecta Ágil - Piloto`, con una
   lista de tareas por expediente. Se sincronizarán tareas, responsables,
   fechas, prioridades y estados.
2. **Zoho CRM:** opcional para cuentas, contactos y seguimiento comercial. No
   se usará como fuente de verdad documental.
3. **Zoho WorkDrive:** no se usará como repositorio principal mientras el
   almacenamiento gratuito y la política de datos de IDC no estén aprobados.
4. **Outbox y reintentos:** la aplicación registrará qué tarea o notificación
   debe sincronizarse, el resultado, el error y el último intento. Nunca se
   expondrán tokens en la interfaz ni en los logs.
5. **Configuración:** las credenciales, scopes, organización, usuarios y
   límites del plan deben ser confirmados por IDC antes de activar OAuth o
   webhooks.

La pantalla de integraciones de Zoho del diseño visual es un catálogo de
alcance y estado, no prueba de que una cuenta o una conexión real estén
configuradas.

## Roadmap pendiente

- **Paso 9:** exportación de expedientes, manifest, hashes, CSV, respaldo e
  importación validada.
- **Paso 10:** endurecimiento de entrega, respaldo externo, restauración,
  observabilidad y preparación de migración.
- Captura guiada y generación completa de F-05.
- Flujos A y B de la especificación ampliada.
- Integración de tareas y notificaciones con Zoho Projects.
- Confirmar con IDC CSA frente a UL, memoria de cálculo, retención, nube,
  umbrales de potencia y demás pendientes de `README-DEMO-2.md`.
- Definir dominio de correo verificado, política de almacenamiento y
  despliegue productivo.
- Incorporar la regresión aislada a CI cuando se configure el flujo de CI.

## Reglas de datos

- Usar únicamente datos ficticios en desarrollo, pruebas, Vercel y demos.
- No copiar nombres, firmas, INE, RFC, domicilios ni documentos del expediente
  real al repositorio.
- No guardar `.env.local`, bases SQLite, `outbox`, tokens o claves en Git.
- Antes de publicar una nueva versión, revisar archivos rastreados y ejecutar
  las pruebas de lint, TypeScript, plantillas y E2E.

## Documentación relacionada

- Especificación funcional del piloto: `06_DOCUMENTACION_Y_PROMPTS/ESPECIFICACION_PILOTO_MT_FV.md`
- [Reporte Paso 7b](docs/reportes/PASO_7b.md)
- [Reporte Paso 8](docs/reportes/PASO_8.md)
- [Reporte Paso 8c](docs/reportes/PASO_8c.md)
- [Reporte Paso 8e](docs/reportes/PASO_8e.md)
- [Catálogo de marcas](docs/PLANTILLAS_MARCAS.md)

