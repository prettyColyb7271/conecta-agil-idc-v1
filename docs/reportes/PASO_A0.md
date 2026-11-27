# Paso A0: regresión y datos de ejemplo

## Commits

- Base del Paso 8d: `91a6998`.
- `b63f33d`: propagación de fallos y resumen de regresión.
- `c7ded99`: limpieza de datos de ejemplo.
- El reporte se registra en un commit posterior; su hash se consulta con `git log -- docs/reportes/PASO_A0.md`.

El segundo commit tiene un título diferente al sugerido en el prompt porque no se demostró que TOTP causara la falla y no se cambió su cálculo.

## Archivos

- `tests/e2e/isolated.mjs` y `tests/e2e/helpers/suite-runner.mjs`: ejecución, propagación y resumen por suite.
- `tests/e2e/supervisor-a0-runner.mjs`: pruebas del ejecutor, conectadas a la regresión.
- `tests/e2e/supervisor-pasos-1-4.mjs`, `supervisor-documentos.mjs`, `supervisor-flujo-g0-g2.mjs` y `supervisor-gestores.mjs`: salida distinta de cero si falla una comprobación.
- `data/mock.ts`, `components/prefs.tsx` y `lib/adapters/mock.ts`: nombre ficticio para el gestor de ejemplo.
- Se eliminó la carpeta anidada vacía después de verificar que no contenía archivos ni enlaces. La búsqueda solicitada no encontró el nombre anterior en archivos rastreados.

## Diagnóstico de la intermitencia

Se ejecutó la regresión completa cinco veces sobre `91a6998` antes de cambiar código: las cinco terminaron con exit 0 y gestores obtuvo 27 ✅ / 0 ❌ en cada una. No hubo un primer fallo que registrar. **La causa histórica del 16/27 no quedó identificada**, por lo que no se puede afirmar que fuera TOTP.

Como contexto, la prueba actual confirma MFA y utiliza un código de respaldo para el siguiente login; la verificación TOTP del servidor admite la ventana actual y las adyacentes. Esto no demuestra qué ocurrió en la corrida histórica. No se modificaron las aserciones ni se añadió un helper TOTP sin evidencia de que corrigiera esa falla.

## Validaciones

Con `APP_MODE=local` y `NEXT_PUBLIC_MODO=local`, en un worktree separado, datos temporales y puertos de prueba:

| Comprobación | Resultado |
|---|---|
| `npm run lint` | ✅ exit 0 |
| `npx --no-install tsc --noEmit` | ✅ exit 0 |
| `npm run plantillas:check` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 |
| Regresión aislada 1, 2 y 3 | ✅ exit 0 en las tres |

Cada celda de la tabla indica ✅/❌ y código de salida; `—` significa que el script no imprime conteo.

| Suite | Corrida 1 | Corrida 2 | Corrida 3 |
|---|---|---|---|
| regresiones-pr1 | —; exit 0 | —; exit 0 | —; exit 0 |
| migration-004-with-data | —; exit 0 | —; exit 0 | —; exit 0 |
| supervisor-a0-runner | 4/0; exit 0 | 4/0; exit 0 | 4/0; exit 0 |
| db-migrate | —; exit 0 | —; exit 0 | —; exit 0 |
| db-seed, solo datos temporales | —; exit 0 | —; exit 0 | —; exit 0 |
| supervisor-pasos-1-4 | 94/0; exit 0 | 94/0; exit 0 | 94/0; exit 0 |
| supervisor-documentos | 33/0; exit 0 | 33/0; exit 0 | 33/0; exit 0 |
| supervisor-paso6 | 13/0; exit 0 | 13/0; exit 0 | 13/0; exit 0 |
| supervisor-gestores | 27/0; exit 0 | 27/0; exit 0 | 27/0; exit 0 |
| supervisor-flujo-g0-g2 | 37/0; exit 0 | 37/0; exit 0 | 37/0; exit 0 |
| supervisor-paso7 | 6/0; exit 0 | 6/0; exit 0 | 6/0; exit 0 |
| supervisor-flujo-g3-g7 | 68/0; exit 0 | 68/0; exit 0 | 68/0; exit 0 |
| supervisor-seguridad-aislado | 10/0; exit 0 | 10/0; exit 0 | 10/0; exit 0 |
| supervisor-seguridad-ataque | 34/0; exit 0 | 34/0; exit 0 | 34/0; exit 0 |
| supervisor-origen-8d | 36/0; exit 0 | 36/0; exit 0 | 36/0; exit 0 |

## Fallos forzados

En la copia aislada se forzó temporalmente una comprobación fallida en la suite antigua y una excepción en cada uno de los dos scripts iniciales. Extracto:

```text
❌ forzado
RESUMEN DE REGRESIÓN:
regresiones-pr1 → exit 1 → sin conteo
migration-004-with-data → exit 1 → sin conteo
supervisor-pasos-1-4 → exit 1 → 94 ✅ / 1 ❌
supervisor-origen-8d → exit 0 → 36 ✅ / 0 ❌
exit=1
```

La última suite también se ejecutó. Los tres archivos de la copia se restauraron y sus hashes coinciden con los del proyecto; las excepciones y la comprobación forzada no forman parte del commit.

## Servidor y pendientes

- Se detuvo el proceso que escuchaba en `:3140`, se compiló la rama, se ejecutó `db:migrate` sin seed y se inició `npm run start:local` en segundo plano. `/api/health` respondió 200.
- Pendiente: identificar la causa del 16/27 si vuelve a reproducirse, conservando el primer error. Las cinco corridas no permiten cerrar ese diagnóstico.
- Pendiente: revisión del supervisor de 8d y A0; prueba real de OneAuth por la dueña. No se hizo push ni merge.
