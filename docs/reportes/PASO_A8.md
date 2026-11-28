# Paso A8 — Administración de seguridad

**Estado:** 🟡 Implementado; pendiente de revisión del supervisor.  
**Rama:** `paso-a8`, creada desde `desarrollo` (`87b2259`).  
**Base de datos:** schema 11; A8 no agrega migraciones.  
**Integración:** sin push ni merge.

## Alcance implementado

- **Recuperación de acceso:** pantallas para el administrador y el Gestor IDC, solicitudes pendientes y atendidas, métricas reales, enlace de un solo uso, desbloqueo, revocación de sesiones y descarte auditado con motivo. El Inicio y la campana alertan sobre solicitudes pendientes. No se muestran ni se fijan contraseñas.
- **Seguridad e incidentes:** alertas calculadas desde `audit_events` para intentos repetidos, cuentas bloqueadas y fallos MFA. Incluyen enlaces a los eventos y acciones disponibles de bloqueo y revocación. La pantalla contiene el flujo fijo Detectar → Analizar → Contener → Notificar → Cerrar. El ciclo de gestión con estados, responsable y notas queda para una fase futura.
- **Cuentas:** cifras reales de cuentas activas, bloqueadas y MFA pendiente; búsqueda por nombre/correo y matriz de roles de solo lectura, incluido Gestor CFE como inactivo.
- **Configuración e integraciones:** estado real de solo lectura, sin rutas completas ni secretos; tarjetas de Zoho CRM y Desk como “No configurado” y sin exponer tokens.
- **Auditoría:** menú y título renombrados, filtro por folio y detalle lateral. La vista filtra identidad y contenido del cliente y solo presenta metadatos permitidos.
- **Permisos:** las páginas nuevas responden 403 a Cliente y Gestor IDC; las rutas administrativas anteriores siguen disponibles.

## Capturas

Generadas en 1366 × 768 con datos ficticios:

- `img/a8-recuperacion.png`
- `img/a8-incidentes.png`
- `img/a8-configuracion.png`
- `img/a8-roles.png`

Corresponden a las Imágenes 23–26 del [índice de capturas](../../../../00_LEEME_PRIMERO/INDICE_REPORTE_FINAL.md).

## Validación

La Regla 2 se ejecutó en una copia aislada con `npm ci` y transporte Zoho forzado a `file`, credenciales vacías y datos temporales:

- `npm run lint` — correcto.
- `npx tsc --noEmit` — correcto.
- `npm run plantillas:check` — correcto.
- `npm run build` — correcto.
- `npm run test:e2e:isolated` — correcto; la suite A8 registró **26 ✅ / 0 ❌**.

La suite A8 verifica solicitudes, permisos, alertas, auditoría, privacidad, configuraciones, integraciones y que una acción de recuperación no reconocida no consuma una solicitud. Ninguna prueba llamó a Zoho real.

## Commits funcionales

- `7eca4c5` — cuentas y recuperación.
- `59e5689` — seguridad e incidentes.
- `9a61737` — configuración e integraciones.
- `d19064a` — auditoría administrativa.

La regresión aislada y las capturas se agregan en el commit de evidencia asociado a este reporte.
