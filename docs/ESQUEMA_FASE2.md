# Esquema posterior del piloto

El PASO 2 implementa únicamente las tablas reducidas definidas por el supervisor
para la presentación del 2 de diciembre. Las siguientes entidades quedan
documentadas para una fase posterior y no se crean todavía:

- `organizations`
- `roles`
- `user_roles`
- `expediente_data` (los datos iniciales viven en `expedientes.data_json`)
- `messages`
- `gate_evidence`
- `templates`
- `generated_documents`
- `outbox_events`

La fuente de verdad funcional sigue siendo
`06_DOCUMENTACION_Y_PROMPTS/ESPECIFICACION_PILOTO_MT_FV.md`. La reducción es
de alcance de implementación, no elimina los requisitos funcionales del piloto.
