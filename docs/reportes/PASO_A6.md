# Paso A6 — Cuentas y correo para los ensayos

**Estado:** 🟡 Implementado; pendiente de revisión del supervisor.
**Rama:** `paso-a6`, creada desde `desarrollo` (`9a2c4b9`).
**Integración:** sin push ni merge; `main` no se modificó.

## Cambios

- Ajustes de revisión del A8b: los expedientes activos solo se muestran para Gestores IDC; los datos no capturados no ofrecen “Mostrar”; las cuentas bloqueadas no permiten emitir enlaces o códigos de recuperación y la API devuelve `409` con el mismo aviso.
- `npm run cuentas:demo` comprueba el aislamiento de `LOCAL_DATA_DIR`, prepara enlaces de un solo uso válidos por 72 horas para las cuentas demo presembradas y guarda los enlaces exclusivamente en `CUENTAS_DEMO.local.md` dentro de la carpeta de demo. La salida de consola solo informa la ruta del archivo. Los enlaces anteriores se invalidan al reemitir; las cuentas con contraseña configurada no se modifican salvo con `--reiniciar <correo-demo>`.
- Se comparte la verificación de contraseñas y la contraseña de semilla de demo con la lógica del script para que la primera ejecución no reemplace una contraseña definida previamente.
- MFA obligatorio para admin y Gestores se activa por variable de proceso, sin modificar `.env.local`. El guion documenta la vinculación privada de OneAuth, el snapshot `base-cuentas` y la restauración de contraseña y MFA.
- El transporte `file` guarda mensajes en `LOCAL_DATA_DIR\outbox-email\`. El guion también explica la prueba opcional y manual de Resend, sin guardar correos ni claves.
- La pantalla de registro en modo demo indica “Demo: no se envía correo”. La tabla de navegación asigna Cliente y Admin a perfiles separados de la dueña, Gestor 1 a un compañero y Gestor 2 a otra persona del equipo.
- Las cuentas, alias, pruebas y datos son ficticios. No se incluyó el correo personal de la dueña, enlaces, contraseñas ni claves en el repositorio.

## Limitación conocida

Si la solicitud no incluye una IP, el límite de recuperación de 10 intentos por hora usa la clave compartida `local`. `x-forwarded-for` solo debe considerarse confiable detrás de un proxy propio.

## Validación

La Regla 2 se ejecutó en una copia aislada con `npm ci`; no se leyó `.env.local`, no se sembró la base real, no se envió correo real ni se llamó a Zoho real. Las pruebas forzaron transporte `file` y credenciales externas vacías.

- `npm run lint` — correcto.
- `npx tsc --noEmit` — correcto.
- `npm run plantillas:check` — 5 plantillas DOCX y F-01 PDF válidos.
- `npm run build` — correcto en modo local.
- `npm run test:e2e:isolated` — 27 suites con conteo, **969 ✅ / 0 ❌**; la migración 004 también terminó con exit 0 (esa suite no imprime conteo).
- Suite A6 — **26 ✅ / 0 ❌**; incluye protección de una contraseña preconfigurada antes de la primera ejecución, uso único y rotación de enlaces, MFA, snapshot/restore, TOTP y aislamiento de transportes.
- Build de OneDrive — correcto; `npm run db:migrate` dejó `schemaVersion=12`, sin ejecutar seed.
- `http://localhost:3140/api/health` — HTTP 200, modo local, `schemaVersion=12`.

## Commits

- `f9a0be3` — `A6: ajustes de la revisión del A8b`.
- `f987e60` — `A6: prepara cuentas y MFA de demo`.

No se hizo push ni merge. El estado del tablero permanece 🟡 hasta la revisión del supervisor.
