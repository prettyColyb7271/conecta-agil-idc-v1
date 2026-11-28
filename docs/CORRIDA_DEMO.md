# Corrida de demostración — Conecta Ágil

Guion de 15 minutos para mostrar el flujo ficticio G0→G7, el reproceso de CFE y la maqueta de Zoho. La UI presenta **Gate 1–Gate 8**; sus códigos internos son G0–G7. Todos los datos de este ensayo son ficticios.

## Preparación segura

1. Cierra cualquier servidor de demo anterior. En PowerShell, configura una carpeta temporal vacía, distinta de `%LOCALAPPDATA%\ConectaAgil` y fuera de OneDrive. Las variables del proceso prevalecen sobre `.env.local`; no abras ni imprimas ese archivo:

   ```powershell
   $env:APP_MODE = "local"
   $env:NEXT_PUBLIC_MODO = "local"
   $env:LOCAL_DATA_DIR = Join-Path $env:TEMP "ConectaAgil-demo"
   $env:DEMO_DOCS_DIR = Join-Path $env:LOCAL_DATA_DIR "documents"
   $env:PUBLIC_BASE_URL = "http://localhost:3140"
   $env:MFA_REQUIRED_ROLES = "admin_seguridad,coordinador_idc"
   $env:ZOHO_TRANSPORT = "file"
   $env:ZOHO_CLIENT_ID = ""
   $env:ZOHO_CLIENT_SECRET = ""
   $env:ZOHO_REFRESH_TOKEN = ""
   $env:ZOHO_PORTAL_ID = ""
   $env:ZOHO_PROJECT_ID = ""
   $env:EMAIL_TRANSPORT = "file"
   $env:RESEND_API_KEY = ""
   ```

2. Solo si `LOCAL_DATA_DIR` está vacía, prepara la semilla, los documentos ficticios y los enlaces personales:

   ```powershell
   npm run demo:seed
   npm run demo:docs
   npm run cuentas:demo
   npm run build
   npm run start:local
   ```

   `demo:seed` crea `IDC-DEMO-0001`, la empresa ficticia de 45.5 kW y cuatro cuentas de prueba: cliente, dos Gestores IDC y admin. `demo:docs` guarda los PDF en `LOCAL_DATA_DIR\documents`. `cuentas:demo` cambia cada contraseña sembrada por una aleatoria desconocida y crea enlaces individuales de un solo uso, válidos 72 horas. La consola solo muestra la ruta del archivo privado `LOCAL_DATA_DIR\CUENTAS_DEMO.local.md`; nunca copies sus enlaces a este guion, reportes, commits o capturas.
3. Abre cada enlace desde el archivo privado en el perfil de navegador de la persona indicada. Cada quien define su propia contraseña y vincula OneAuth en **Mi seguridad**; es obligatorio para admin y Gestores, opcional para Cliente. La dueña puede usar perfiles separados para sus roles. Mantén dos Gestores distintos para la regla de cuatro ojos; quien sube un documento no debe validarlo ni cerrar su propio Gate.
4. Después de definir las contraseñas y vincular OneAuth, detén `:3140` y guarda la base inicial:

   ```powershell
   npm run demo:snapshot -- save base-cuentas
   ```

   Cada ensayo comienza con el servidor detenido y restaura ese estado:

   ```powershell
   npm run demo:snapshot -- restore base-cuentas
   npm run start:local
   ```

   El snapshot conserva las contraseñas y el MFA cifrado; al restaurarlo, OneAuth sigue funcionando con la misma `MFA_ENCRYPTION_KEY` y no hay que volver a vincular. Los enlaces no se copian al snapshot y el restore elimina el archivo `CUENTAS_DEMO.local.md`. Si se rota la clave MFA antes de crear cuentas reales, hay que volver a vincular OneAuth en la demo.

5. Vincula OneAuth sin proyectar la pantalla: apaga la pantalla duplicada o mueve la ventana fuera de la proyección mientras se muestra el QR. Si el celular falla, usa uno de los códigos de respaldo y guárdalo fuera del repositorio.

### Puntos de recuperación

Guarda snapshots en los tres puntos clave:

```powershell
npm run demo:snapshot -- save antes-gate-2
npm run demo:snapshot -- save antes-gate-4
npm run demo:snapshot -- save antes-reproceso
```

Los snapshots quedan en una carpeta hermana de `LOCAL_DATA_DIR`; contienen una copia consistente de SQLite, documentos ficticios y la carpeta de correo de demo. `CUENTAS_DEMO.local.md` se excluye porque contiene enlaces de un solo uso. Para restaurar, detén `:3140` y usa el mismo nombre:

```powershell
npm run demo:snapshot -- restore antes-reproceso
```

El comando se niega a operar si `LOCAL_DATA_DIR` coincide con la base real, está dentro de ella o está en OneDrive. No ejecutes `db:seed` ni `demo:seed` sobre la base real.

## Cuentas, correo y navegadores

| Cuenta ficticia | Quién la usa | Uso en el ensayo | Perfil de navegador |
|---|---|---|---|
| Cliente (`cliente.demo@example.invalid`) | La dueña | Captura y consulta del expediente | Perfil Cliente, separado del admin |
| Gestor 1 (`coordinador.demo@example.invalid`) | Un compañero del equipo | Revisión y carga de documentos | Perfil Gestor 1 |
| Gestor 2 (`idc2.demo@example.invalid`) | Otra persona del equipo | Validación independiente y cierre de Gates | Perfil Gestor 2 |
| Admin (`seguridad.demo@example.invalid`) | La dueña | Cuentas, auditoría y seguridad | Perfil Admin, separado del cliente |

Cada perfil inicia sesión con la contraseña definida por su titular; el guion no guarda contraseñas. En la instancia local, los correos de registro y avisos se guardan en `LOCAL_DATA_DIR\outbox-email\`. Para la presentación puede mostrarse el mensaje de registro recibido, siempre que se mantenga el transporte `file`.

La pantalla de registro de Vercel está en modo demo y debe mostrar **“Demo: no se envía correo”**; enviar el formulario allí no manda correo.

### Prueba opcional de Resend (solo la dueña)

Las pruebas automáticas y los ensayos nunca usan Resend. Si se desea verificar manualmente un único envío, usa la carpeta aislada de demo, deja Zoho en `file`, y reinicia el servidor así:

```powershell
$env:EMAIL_TRANSPORT = "resend"
Remove-Item Env:RESEND_API_KEY -ErrorAction SilentlyContinue
npm run start:local
```

No inspecciones ni imprimas `.env.local`; deja que Next.js cargue la clave protegida desde su configuración local. En el formulario de registro introduce únicamente el correo propio de la cuenta de Resend, sin ponerlo en el repositorio ni en capturas. Resend solo entregará a esa cuenta mientras el dominio no esté verificado. Después de recibir el mensaje, detén el servidor y vuelve a `EMAIL_TRANSPORT=file` y `RESEND_API_KEY=""` antes de continuar los ensayos.

## Guion cronometrado

| Tiempo | Escena y acciones | Qué debe verse |
|---|---|---|
| 0:00–0:45 | Presentación del objetivo. Muestra los cuatro perfiles y explica que cada cuenta tiene permisos distintos. | La plataforma de prueba local y el expediente `IDC-DEMO-0001`, sin datos reales. |
| 0:45–2:30 | **Gate 1 · Registro y captura.** El Cliente acepta el aviso de privacidad, completa la captura y carga R06, R08 y R09. Gestor 1 integra R02–R05; Gestor 2 valida los archivos para mostrar la separación de funciones. | La captura se reutiliza; el portal indica qué requisito falta y quién debe atenderlo. |
| 2:30–4:00 | **Gate 2 · Listo para firma.** Gestor 1 revisa los requisitos de IDC y cierra Gate 2 cuando están validados. | Requisitos R01–R09 con estado y responsable; el cliente no ve notas internas. |
| 4:00–5:00 | **Gate 3 · Cita única de firma.** Gestor 1 genera F-01 y F-02, los imprime para la cita presencial y carga los escaneos. Gestor 2 verifica ambos escaneos. | Firma física y verificación por otro Gestor IDC antes de cerrar. |
| 5:00–6:00 | **Gate 4 · UVIE e ingreso a CFE.** IDC integra R10 y R11, registra el acuse con medio y número de solicitud y cierra Gate 4. | Dictamen UVIE, expediente ingresado y acuse asociado. |
| 6:00–7:15 | **Gate 5 · Oficio resolutivo.** Gestor 1 registra un oficio favorable o condicionado y revisa fecha límite y días restantes. | Aviso de vigencia con fecha visible en dd/mm/aaaa. |
| 7:15–8:15 | **Gate 6 · Firma de contratos.** Se registra el contrato y se cierra el Gate. | El hito del contrato queda en el historial del expediente. |
| 8:15–10:00 | **Gate 7 · Inspección UIIE.** Cliente y Gestor IDC completan sus requisitos U; se registra visita y certificado UIIE. | Estado por requisito, responsable y avance de la inspección. |
| 10:00–11:00 | **Gate 8 · Medidor y alta.** Gestor 1 registra medidor, interconexión y alta comercial. Gestor 2, que no es el responsable, cierra el último Gate. | Expediente cerrado; el tablero muestra conteos reales del piloto de prueba. |
| 11:00–13:00 | **Escena del reproceso CFE.** Registra que CFE observó R03 (lo integra IDC) y R09 (lo aporta el Cliente). Muestra el semáforo 🔴 → 🟡 → 🟢, “Le toca a” en cada paso, la retroalimentación visible al cliente y las notas internas solo para IDC. El Cliente corrige R09; IDC corrige R03. Registra un acuse nuevo posterior al reinicio. | Solo R03 y R09 se reabren; el Gate 2 se reabre y el acuse anterior no sirve para cerrar Gate 4. |
| 13:00–14:00 | **Zoho Projects.** En Integraciones, muestra el estado de la outbox y “Así se vería en Zoho Projects”: ocho tareas y sus subtareas, generadas desde los metadatos de la outbox. | Sin documentos, RFC, INE, retroalimentación ni notas internas. La maqueta funciona con `ZOHO_TRANSPORT=file`. |
| 14:00–15:00 | Cierre y preguntas. Recalca qué queda en modo archivo y cuál sería la siguiente fase. | El alcance de la demostración y sus límites quedan claros. |

La suma planeada es 15 minutos. Si una escena se retrasa, omite la navegación repetida por menús, no los controles de permisos, la verificación por segundo gestor ni el acuse nuevo.

## Transporte Zoho y limpieza de tareas de demo

Los ensayos usan `ZOHO_TRANSPORT=file`; no crean tareas en Zoho. Solo la presentación final puede usar `api`, con autorización expresa y después de comprobar el proyecto y el folio ficticio. Ningún documento se envía a Zoho.

Si una corrida autorizada creó tareas de prueba y se necesita limpiarlas, identifica primero el folio ficticio exacto. El comando lista únicamente las tareas `Gate 1` a `Gate 8` cuyo nombre coincide con ese folio y requiere una confirmación `s`:

```powershell
npm run zoho:limpiar-demo -- IDC-DEMO-0001
```

No confirmes si aparece un folio distinto. El comando no borra tareas de otro folio y no imprime credenciales. La regresión de esta función se ejecuta únicamente contra un simulador local; no es una prueba contra Zoho real.

## Plan B

- Si una pantalla queda en un estado inesperado, cierra el servidor y restaura el snapshot más cercano. Vuelve a iniciar con `ZOHO_TRANSPORT=file`.
- Si falla Zoho o la red durante la presentación, usa la maqueta de Integraciones; no pauses ni reviertas el expediente por una falla de transporte.
- Si falla la aplicación, continúa con el video de respaldo y explica que la corrida automatizada cubre G0→G7 y el reproceso.
- Antes de compartir pantalla, confirma que no se vean contraseñas, QR MFA, secretos, códigos de respaldo, `.env.local` ni datos reales.

## Capturas

Para regenerar las 22 capturas con Edge instalado, sin descargar navegador y usando otra base temporal en modo archivo:

```powershell
npm run capturas
```

El comando automatiza la corrida G0→G7, comprueba que la pantalla de MFA no muestre QR ni URI, valida que no aparezcan credenciales y guarda las imágenes en `docs/reporte/capturas/`.
