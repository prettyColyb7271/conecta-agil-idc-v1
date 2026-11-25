# PASO 8 — Seguridad del administrador

## Alcance

- MFA TOTP para `admin_seguridad`, con secreto cifrado AES-256-GCM.
- Códigos de respaldo de un solo uso almacenados como hashes.
- Desafíos de login de cinco minutos, con límite de intentos y sin sesión antes de validar MFA.
- Bitácora de accesos con filtros, sesiones activas, resumen diario y exportación CSV.
- Recuperación de contraseña de clientes con respuesta genérica y enlace de un solo uso entregado por un Gestor IDC o el administrador.
- Desvinculación administrativa de MFA con motivo y revocación de sesiones.

## Decisiones

- La vinculación muestra una URI `otpauth://` y el secreto manual; no se agrega una dependencia QR.
- `MFA_ENCRYPTION_KEY` es obligatorio para activar MFA y representa exactamente 32 bytes.
- La metadata de auditoría no incluye contraseñas, secretos, códigos TOTP ni datos de expedientes.
- `admin_seguridad` queda limitado a `/seguridad` hasta vincular MFA.

## Validación

- `npm run lint`: OK.
- `npx tsc --noEmit`: OK.
- `npm run build` con `APP_MODE=local`: OK.
- `npm run db:migrate`: schemaVersion 8.
- `npm run test:e2e:isolated`: OK.
  - regresión histórica: 94/94, 33/33, 13/13, 27/27, 37/37, 52/52.
  - seguridad aislada: 10/10.

## Configuración local

Definir `MFA_ENCRYPTION_KEY` fuera de git como hexadecimal de 64 caracteres o Base64 equivalente. El valor de pruebas es ficticio y solo se inyecta en las suites aisladas.
