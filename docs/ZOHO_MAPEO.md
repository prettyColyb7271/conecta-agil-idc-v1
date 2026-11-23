# Mapeo futuro con Zoho

Este documento describe el mapeo previsto para una futura integración. No hay conexión, credenciales ni llamadas a Zoho en el piloto.

| Conecta Ágil IDC | Zoho previsto | Llave o relación |
|---|---|---|
| Gestor IDC | Usuario de Zoho | El correo electrónico es la llave estable del usuario. |
| Responsable IDC de un expediente | Owner de Zoho | El owner corresponde al Gestor IDC responsable; se resolverá por correo. |
| Expediente | Project | El folio IDC será el identificador visible y el nombre del proyecto. |
| Gate G0–G7 | Milestone | Cada gate se representará como milestone con su estado y fechas. |
| Pendiente derivado | Task | El tipo de pendiente, expediente y requisito serán campos o referencias de la tarea. |

La plataforma local seguirá siendo la fuente de verdad de autenticación, documentos, auditoría y estados del expediente. Zoho se considerará una vista operativa posterior, no un almacenamiento de documentos sensibles.
