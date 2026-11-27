# Integración de 8d y A0

El supervisor aprobó 8d y A0 y verificó 15 suites con 362 ✅ / 0 ❌ antes de los dos ajustes adicionales.

## Cambios y commits

- `1c0eec1` — `Endurecer anti-reutilización de códigos TOTP`: se exige que el paso aceptado sea posterior al último utilizado. La prueba usa N, luego N+1, y rechaza el reintento de N.
- `7ca1c2b` — `Evitar regresiones e2e simultáneas`: candado exclusivo con PID y fecha; una segunda ejecución se rechaza y un candado con PID inexistente se recupera.
- El informe se registra en un commit posterior; puede identificarse con `git log -- docs/reportes/PASO_INTEGRACION_8d.md`.

La hipótesis del 16/27 histórico es que dos regresiones simultáneas compartieron los puertos fijos 3194–3201. **No está demostrada**: las cinco corridas de diagnóstico de A0 no reprodujeron el fallo. El candado evita esa concurrencia entre ejecuciones de la regresión aislada.

La recuperación de un candado abandonado se serializa con un archivo auxiliar. Si el proceso termina durante esa recuperación y deja el auxiliar, el ejecutor informa el problema en vez de eliminarlo sin verificar; hay que comprobar que no haya una regresión activa antes de retirarlo manualmente.

## Pruebas

Antes de corregir TOTP, la nueva prueba reprodujo el defecto: el reintento de N respondió 200 en vez de 401 (35 ✅ / 1 ❌). Después de la corrección:

| Prueba | Resultado |
|---|---|
| `npm run lint` | ✅ exit 0 |
| `npx --no-install tsc --noEmit` | ✅ exit 0 |
| `npm run plantillas:check` | ✅ exit 0 |
| `npm run build`, copia aislada | ✅ exit 0 |
| `npm run test:e2e:isolated` | ✅ exit 0; 368 ✅ / 0 ❌ |
| Segunda regresión simultánea | ✅ rechazada con exit 1 y mensaje de PID activo |
| Candado con PID inexistente | ✅ recuperado en la prueba aislada |

| Suite o preparación | ✅ / ❌ | Exit |
|---|---:|---:|
| regresiones-pr1 | sin conteo | 0 |
| migration-004-with-data | sin conteo | 0 |
| supervisor-a0-runner | 8 / 0 | 0 |
| db-migrate | sin conteo | 0 |
| db-seed, solo en datos temporales | sin conteo | 0 |
| supervisor-pasos-1-4 | 94 / 0 | 0 |
| supervisor-documentos | 33 / 0 | 0 |
| supervisor-paso6 | 13 / 0 | 0 |
| supervisor-gestores | 27 / 0 | 0 |
| supervisor-flujo-g0-g2 | 37 / 0 | 0 |
| supervisor-paso7 | 6 / 0 | 0 |
| supervisor-flujo-g3-g7 | 68 / 0 | 0 |
| supervisor-seguridad-aislado | 10 / 0 | 0 |
| supervisor-seguridad-ataque | 36 / 0 | 0 |
| supervisor-origen-8d | 36 / 0 | 0 |

## Integración y servidor

- `desarrollo` avanzó por fast-forward desde `dc00f23` hasta `7ca1c2b`; se subió por HTTPS sin forzar y se verificó el mismo hash remoto.
- Se detuvo solo el proceso de `:3140`, se compiló `desarrollo`, se ejecutó `db:migrate` sin seed y se inició `npm run start:local` de forma persistente. `/api/health` respondió 200.
- Se eliminó el worktree de validación y la rama local integrada `paso-8d`. Git informó inicialmente un límite de longitud de ruta de Windows; los restos identificados se retiraron de la copia temporal. Queda solo el worktree de OneDrive.
- `main` no se modificó. No se hizo túnel ni despliegue.

## Pendientes

- La causa histórica del 16/27 permanece sin confirmar.
- Revisión del supervisor del paso 4 y prueba real de vinculación OneAuth por la dueña, si aún está pendiente.
