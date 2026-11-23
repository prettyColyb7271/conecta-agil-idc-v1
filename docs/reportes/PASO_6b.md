# PASO 6b — enlace de un solo uso para Gestores IDC

## Alcance

Se sustituyeron las contraseñas temporales entregadas por el administrador por
enlaces de definición de contraseña. El enlace contiene un token aleatorio de
32 bytes, se almacena únicamente como SHA-256, vence en 24 horas y solo puede
utilizarse una vez.

## Implementación

- `005_password_setup_tokens.sql` crea la tabla de tokens, índices de usuario y
  expiración.
- El alta y el restablecimiento de Gestor IDC invalidan tokens anteriores y
  devuelven únicamente `setupUrl` y `expiresAt`; nunca devuelven una contraseña.
- `/definir-contrasena` permite definir y confirmar la contraseña sin sesión.
- `POST /api/auth/setup-password` valida token, expiración, uso previo y rol;
  responde con el mismo mensaje genérico para enlaces inválidos, expirados o
  utilizados.
- La definición revoca sesiones existentes, registra auditoría sin secretos y
  conserva `must_change_password` como defensa de compatibilidad para cuentas
  legacy.
- Se aplica un límite básico de 10 intentos por minuto por origen de red.
- La UI administrativa muestra el enlace una sola vez y advierte su vigencia.

## Validación

- `npm run lint` ✅
- `npm exec -- tsc --noEmit` ✅
- `npm run build` en modo local ✅
- `npm run test:e2e:isolated` ✅
  - suite general: 94/94
  - suite documental: 33/33
  - Paso 6: 12/12
  - Gestores IDC / Paso 6b: 25/25

La suite verifica reutilización, reset, revocación de sesiones, ausencia de
contraseñas y tokens en respuestas/listados/auditoría/logs, y preserva las
comprobaciones de la defensa `must_change_password`.
