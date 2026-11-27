# Paso 8d — Seguridad y acceso

## Alcance y commits

- Base: `dc00f23` (`desarrollo`).
- `79e6693` — validación de origen, MFA, recuperación y regresión.
- `08a0e98` — reparación de la vinculación MFA en la pantalla.
- `764f22d` — QR TOTP generado localmente, compatible con OneAuth.
- El commit que contiene este reporte añade la documentación final.
- Rama: `paso-8d`. No se hizo push ni merge.

## Cambios

- Origen aceptado únicamente si coincide con el origen de la solicitud, el protocolo de la solicitud más `Host`, `PUBLIC_BASE_URL` o un origen configurado en `ALLOWED_ORIGINS`. No se utiliza `X-Forwarded-Host` como autorización. Sin `Origin` o con un origen ajeno se responde 403.
- Las páginas de administración redirigen a seguridad cuando el administrador autenticado aún no ha vinculado MFA. Un usuario con MFA vinculado siempre debe superar el desafío de inicio de sesión.
- Desvincular MFA requiere un motivo de al menos cinco caracteres y lo registra en la bitácora.
- Los enlaces de definición admiten clientes y Gestores IDC activos, con vencimiento y un solo uso, y registran el rol real.
- Se corrigió la respuesta de vinculación en la interfaz. El QR se genera en el navegador, sin un servicio externo; también se muestran la clave manual y, opcionalmente, la URI.
- `start:local` ejecuta `next start -p 3140` sin `-H`. La regresión incluye las suites adversarial y de origen, y la adversarial devuelve código distinto de cero al fallar.

## Pruebas

La validación se realizó fuera de OneDrive, con datos ficticios temporales, puertos libres y modo local. La línea anterior corresponde a la verificación de PR #1; no se repitió el estado anterior en este paso.

| Prueba | Antes | Después |
|---|---|---|
| `npm run lint` | Correcto en PR #1 | Correcto |
| `npx --no-install tsc --noEmit` | Correcto en PR #1 | Correcto |
| `npm run plantillas:check` | Correcto en PR #1 | 5 DOCX y F-01 correctos |
| `npm run build` aislado | Correcto en PR #1 | Correcto |
| `npm run test:e2e:isolated` | 288 correctas, más regresión y migración sin conteo | 358 correctas, más regresión y migración sin conteo; incluye 34 adversariales y 36 de origen y seguridad |
| `supervisor-seguridad-ataque.mjs` independiente | 28 correctas / 6 fallidas | 34 correctas / 0 fallidas |
| Código de salida adversarial con fallo inyectado en memoria | No señalaba fallas | 33 correctas / 1 fallo deliberado; salida 1, sin modificar la suite guardada |
| Navegador aislado: vinculación, confirmación y login MFA | No probado | Correcto con cuenta ficticia |
| QR TOTP en navegador | No disponible | Decodificado con un lector independiente y comparado exactamente con la URI ficticia |
| Build y `db:migrate` en OneDrive | — | Correctos después de detener :3140; esquema 8; sin seed |
| `/api/health` en :3140 | — | HTTP 200; servidor iniciado con `npm run start:local` en segundo plano |
| Login real en localhost | — | La usuaria confirmó el acceso y el desafío MFA antes de la última actualización de interfaz; no se registró el HTTP exacto. Pendiente repetir la comprobación en la versión con QR |

## Archivos

- `lib/auth.ts`, `proxy.ts`
- `app/api/auth/login/route.ts`, `app/api/auth/mfa/verify/route.ts`, `app/api/auth/setup-password/route.ts`, `app/api/admin/users/route.ts`
- `components/MfaSetup.tsx`
- `tests/e2e/isolated.mjs`, `tests/e2e/supervisor-seguridad-ataque.mjs`, `tests/e2e/supervisor-origen-8d.mjs`
- `.env.example`, `package.json`, `package-lock.json`, `README.md` y este reporte.
- `00_LEEME_PRIMERO/ESTADO_ACTUAL.md` se actualizó fuera del repositorio y no forma parte del commit.

## Pendientes

- Revisar la rama e integrar o publicar solo con autorización.
- Repetir el login real y probar la vinculación del administrador con OneAuth y el acceso desde la red en la versión final. La prueba de navegador y la decodificación del QR usaron exclusivamente datos ficticios.
- La prueba de pantalla y decodificación del QR fue manual en navegador; automatizarla en CI cuando exista infraestructura de navegador.
- El inicio de sesión federado con Google, Zoho u otro proveedor no está implementado. Vercel sigue en modo demo: antes de usar cuentas o documentos reales requiere autenticación, verificación de correo, almacenamiento persistente y aprobación de la política de datos.
- Para un túnel, configurar explícitamente los orígenes permitidos y validar el `Host` en el proxy frontal; usar HTTPS y no compartir el QR ni la clave MFA.
