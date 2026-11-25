# PASO 8e — correo transaccional

## Alcance

- Registro de clientes: confirmación de solicitud recibida.
- Aprobación o rechazo por el coordinador IDC: aviso al correo de la solicitud.
- Transporte `file` para pruebas automáticas: escribe mensajes JSON en `LOCAL_DATA_DIR\outbox`.
- Transporte `resend` para operación: usa únicamente `process.env.RESEND_API_KEY` mediante `https://api.resend.com/emails`.
- `EMAIL_FROM`, `EMAIL_TRANSPORT` y `PUBLIC_BASE_URL` se configuran fuera del código.

## Seguridad

- La clave de Resend nunca se registra, persiste en SQLite ni aparece en mensajes de error.
- Las suites E2E fuerzan `EMAIL_TRANSPORT=file` y usan destinatarios ficticios.
- Sin dominio verificado, Resend solo permite probar destinatarios autorizados por la cuenta de Resend; para el equipo se requiere verificar un dominio.

## Validación

- `npx tsc --noEmit`: OK.
- `npm run lint`: OK.
- La regresión E2E existente continúa usando el transporte de archivo aislado.
