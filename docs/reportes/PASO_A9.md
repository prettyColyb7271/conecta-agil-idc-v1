# Paso A9 — Aviso de privacidad y capturas

## Alcance implementado

- Se publicó `/privacidad` con el texto del borrador de IDC, versión `0.1-borrador`, fecha y franja de revisión. Los marcadores `[CONFIRMAR]` y `[ACTUALIZAR]` se conservan y resaltan.
- El portal muestra el resumen, enlace al aviso, casilla y aceptación deshabilitada hasta marcarla. Una versión aceptada anterior vuelve a pedir consentimiento sin modificar los Gates.
- El registro público exige el consentimiento también en el API y conserva la versión aceptada en `account_requests` mediante la migración 011 (`schemaVersion=11`).
- El Inicio del administrador muestra la versión y conteos de aceptaciones como metadatos.
- Se corrigieron el logo y el nombre de usuario en el marco local, se volvió a tomar la captura 05 y se agregó la captura 22b del cliente, sin notas internas.
- Se actualizaron las regresiones dependientes de la versión del aviso y del schemaVersion.

## Validación

Validación completa en una copia temporal aislada, creada sin `.env.local`; las variables de Zoho y correo se forzaron a transporte `file`.

| Comprobación | Resultado |
|---|---:|
| `npm ci` | Correcto |
| `npm run lint` | Correcto, sin advertencias |
| `npx tsc --noEmit` | Correcto |
| `npm run plantillas:check` | 5 DOCX y F-01 válidos |
| `npm run build` | Correcto |
| `npm run test:e2e:isolated` | 894 ✅ / 0 ❌; incluye migraciones 010/011 |
| Suite `supervisor-a9-aviso.mjs` | 16 ✅ / 0 ❌ |
| `npm run capturas` | 255 ✅ / 0 ❌; 23 PNG validados |
| Build final en OneDrive | Correcto |
| `npm run db:migrate` en OneDrive | `schemaVersion=11`; no se ejecutó seed |
| `http://localhost:3140/api/health` | HTTP 200, `schemaVersion=11` |
| `http://localhost:3140/privacidad` | HTTP 200 |

Las 23 capturas se revisaron visualmente. La 05 muestra el aviso y consentimiento; la 22b muestra semáforo, retroalimentación y “Le toca a”, sin notas internas. No se leyó `.env.local` ni se contactó a Zoho.

## Estado

- Rama: `paso-a9`, creada desde `desarrollo` en `fb2b5c5`.
- Commit de implementación: `01b2f64` (`A9: aviso de privacidad y aceptación versionada`).
- A9 queda 🟡, pendiente de revisión del supervisor.
- Sin push ni merge.
