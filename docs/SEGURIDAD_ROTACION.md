# Rotación de credenciales locales

Este procedimiento es para la dueña del proyecto. No compartas valores de `.env.local` por chat, correo, capturas ni commits. Usa únicamente cuentas ficticias para verificar cambios y nunca ejecutes scripts de rotación contra una copia de validación que contenga datos reales.

## Bitácora de accesos: minimización de datos

La bitácora guarda solo lo necesario para detectar y revisar intentos de acceso:

- Si el evento tiene una cuenta asociada (`actor_id`), no conserva un correo en `metadata_json`; la pantalla identifica la cuenta por su nombre.
- Si la cuenta no existe, conserva el correo enmascarado con `maskEmail` para reconocer intentos repetidos sin exponer la dirección completa.
- La dirección IP se trunca con `truncateIp`. No se guarda ni se muestra el `user-agent`.
- La migración 010 minimiza del mismo modo los eventos históricos, cambiando únicamente `metadata_json`; preserva los demás campos de la bitácora y sus eventos.

Esta decisión aplica el principio de minimización de datos personales para el piloto. El costo aceptado es que la bitácora no permite bloquear una IP exacta; si se necesita ese control, se configura en el firewall o el proxy, no se conserva la dirección completa en la bitácora.

## Clave de cifrado MFA

La rotación re-cifra los secretos TOTP existentes con un IV nuevo por usuario. Mantiene el vínculo de OneAuth, `last_used_step` y los códigos de respaldo. Antes de actualizar la base, el script crea una copia en `LOCAL_DATA_DIR\respaldos\` con el nombre `antes-rotacion-mfa-<fecha>.sqlite`.

1. Detén el proceso local de Conecta Ágil en `:3140`.
2. Desde `09_MAIN_CODE_V1\Conecta-agil-fase1`, ejecuta `npm run mfa:nueva-clave`. Copia la única línea directamente a `.env.local`; no la pegues en el chat ni la guardes en el repositorio.
3. En `.env.local`, mueve el valor actual de `MFA_ENCRYPTION_KEY` a `MFA_ENCRYPTION_KEY_ANTERIOR` y asigna la nueva clave a `MFA_ENCRYPTION_KEY`. No cambies otras variables.
4. Ejecuta `npm run mfa:rotar-clave`. La salida solo informa cuántos secretos se re-cifraron. Si falla, no continúes ni arranques la aplicación: conserva el respaldo y revisa la configuración local sin compartir sus valores.
5. Si la rotación terminó correctamente, elimina `MFA_ENCRYPTION_KEY_ANTERIOR` de `.env.local` y guarda el archivo.
6. Arranca con `npm run start:local` y comprueba el inicio de sesión del administrador con OneAuth. El vínculo existente debe seguir funcionando; no hace falta volver a vincular MFA.
7. Conserva el respaldo en un lugar protegido hasta confirmar el acceso. Si la rotación terminó pero el acceso falla, detén la aplicación, restaura la base desde el respaldo correspondiente y vuelve a configurar la clave anterior como `MFA_ENCRYPTION_KEY` antes de iniciar. No combines una base re-cifrada con la clave anterior.

No ejecutes `db:seed` durante este procedimiento. Nunca ejecutes `mfa:rotar-clave` contra la base real como parte de una prueba automatizada.

## Resend

1. Entra a la cuenta propietaria en el panel oficial de Resend y revoca la clave expuesta o que se desea renovar.
2. Crea una clave nueva con los permisos mínimos necesarios.
3. Actualiza `RESEND_API_KEY` directamente en `.env.local`; no compartas ni registres el valor.
4. Reinicia `:3140` en una ventana acordada y comprueba el envío de prueba autorizado. Si el dominio no está verificado, Resend puede limitar los destinatarios permitidos.

## Zoho Projects

Usa el procedimiento local ya preparado en [zoho-renovar-token.ps1](../../../00_LEEME_PRIMERO/HERRAMIENTAS/zoho-renovar-token.ps1), ejecutándolo desde una terminal de PowerShell propia y nunca desde un chat:

```powershell
powershell -ExecutionPolicy Bypass -File ".\00_LEEME_PRIMERO\HERRAMIENTAS\zoho-renovar-token.ps1"
```

En la consola oficial de Zoho crea un Self Client nuevo (o regenera el secreto) y genera un grant code con los alcances que pide la herramienta. El script solicita el client secret y el grant code de forma oculta y actualiza `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` y `ZOHO_REFRESH_TOKEN` en `.env.local`. El script actual no revoca el refresh token anterior: revocarlo puede invalidar también el nuevo token del mismo Self Client. La dueña confirmó que regenerar el Client Secret es suficiente para invalidar el anterior; no intentes revocarlo manualmente como parte de esta rotación. No copies credenciales o tokens en informes, commits ni mensajes.

Mantén `ZOHO_TRANSPORT=file` salvo que la dueña y el supervisor acuerden expresamente una prueba real; después de una renovación, una prueba API requiere reiniciar la aplicación para cargar la configuración.
