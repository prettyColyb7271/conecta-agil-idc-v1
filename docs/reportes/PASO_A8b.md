# Paso A8b — Recuperación, contacto protegido y bajas de cuentas

**Estado:** 🟡 Implementado; pendiente de revisión del supervisor.
**Rama:** `paso-a8b`, creada desde `desarrollo` (`2984146`).
**Base de datos:** schema 12, migración `012_a8b_contact_recovery_deactivation.sql`.
**Integración:** sin push ni merge.

## Alcance implementado

- **Ajustes de revisión del A8:** el Gestor IDC solo consulta y descarta solicitudes de clientes; en Recuperación se ofrecen al admin las acciones permitidas por rol. La matriz de permisos del Gestor, la etiqueta de versión del esquema y el formato de resultados de la suite A8 quedaron corregidos.
- **Recuperación:** notificaciones al admin y al Gestor responsable, código legible de un uso con hash y vencimiento de 30 minutos, máximo de intentos, registro de auditoría sin el código, honeypot y límites por correo/IP. Las solicitudes de cuentas inexistentes conservan la respuesta pública genérica y no notifican al Gestor.
- **Contacto de cuenta:** nombre, apellidos y teléfono separados de los datos del expediente. Cliente y Gestor pueden actualizar su teléfono; el admin ve datos enmascarados y revela un solo campo tras MFA reciente. La auditoría registra cuenta y campo, nunca el valor. El Gestor IDC no tiene controles para revelar datos.
- **Bajas:** conserva cuentas, historial y expedientes; requiere motivo, protege al último admin y a la cuenta propia, y exige reasignar expedientes activos antes de dar de baja a un Gestor.
- **Mi seguridad:** disponible por rol dentro de su propio marco. MFA obligatorio para admin y Gestor se configura en `.env.example`; Cliente mantiene la opción de vincular o desvincular.
- No se modificó ni leyó `.env.local`.

## Capturas

Generadas a 1366 × 768 con datos ficticios:

- [Recuperación con código](img/a8b-recuperacion-codigo.png)
- [Dato de contacto revelado](img/a8b-dato-revelado.png)
- [Baja de cuenta](img/a8b-baja-cuenta.png)

## Validación

La Regla 2 se ejecutó en una copia aislada con `npm ci`; modo local, `EMAIL_TRANSPORT=file`, `ZOHO_TRANSPORT=file`, credenciales de Zoho vacías y datos temporales. No se envió correo real ni se llamó a Zoho:

- `npm run lint` — correcto.
- `npx tsc --noEmit` — correcto.
- `npm run plantillas:check` — correcto (5 DOCX y F-01).
- `npm run build` — correcto.
- `npm run test:e2e:isolated` — todas las suites terminaron con exit 0.
- Suite A8b: **19 ✅ / 0 ❌**; migración 012 con datos: **3 ✅ / 0 ❌**; A9: **16 ✅ / 0 ❌**; A8: **26 ✅ / 0 ❌**.

La suite A8b cubre permisos por rol, notificaciones, código de recuperación, honeypot y límites, revelación de datos, bajas y reasignación, Mi seguridad por rol y respuestas administrativas sin secretos ni contenido de expedientes.

## Trabajo futuro

- Cloudflare Turnstile: requiere claves y envía datos a un tercero; no se incorporó.
- Recuperación por correo: activar cuando el dominio de Resend esté verificado.
- SMS no se incorpora; OneAuth usa TOTP y códigos de respaldo.

## Commits

- `4936c21` — `A8b: ajustes de la revisión del A8`.
- `698cc24` — `A8b: implementa recuperación y seguridad de cuentas`.

## Estado de entrega

Pendiente de revisión del supervisor. No se hizo push ni merge.
