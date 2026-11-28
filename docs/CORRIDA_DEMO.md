# Corrida de demostración — Conecta Ágil

Guion de 15 minutos para mostrar el flujo ficticio G0→G7, el reproceso de CFE y la maqueta de Zoho. La UI presenta **Gate 1–Gate 8**; sus códigos internos son G0–G7. Todos los datos de este ensayo son ficticios.

## Preparación segura

1. Cierra cualquier servidor de demo anterior. En PowerShell, configura una carpeta temporal vacía, distinta de `%LOCALAPPDATA%\ConectaAgil` y fuera de OneDrive:

   ```powershell
   $env:APP_MODE = "local"
   $env:NEXT_PUBLIC_MODO = "local"
   $env:LOCAL_DATA_DIR = Join-Path $env:TEMP "ConectaAgil-demo"
   $env:ZOHO_TRANSPORT = "file"
   $env:ZOHO_CLIENT_ID = ""
   $env:ZOHO_CLIENT_SECRET = ""
   $env:ZOHO_REFRESH_TOKEN = ""
   $env:ZOHO_PORTAL_ID = ""
   $env:ZOHO_PROJECT_ID = ""
   $env:EMAIL_TRANSPORT = "file"
   ```

2. Solo si la carpeta de demo está vacía:

   ```powershell
   npm run demo:seed
   npm run demo:docs
   npm run build
   npm run start:local
   ```

   `demo:seed` crea `IDC-DEMO-0001`, la empresa ficticia de 45.5 kW y cuatro cuentas de prueba: cliente, dos Gestores IDC y admin. El comando aplica las migraciones, pero no inicializa ni modifica la base real. La contraseña de prueba no se imprime en consola ni en este guion. Abre `http://localhost:3140`.

3. Usa cuatro perfiles separados del navegador: Cliente, Gestor 1 (`coordinador.demo@example.invalid`), Gestor 2 (`idc2.demo@example.invalid`) y admin (`seguridad.demo@example.invalid`). Inicia sesión en cada uno con las credenciales de demo aprobadas y completa MFA del admin antes de compartir pantalla. El tercer navegador de trabajo puede ser una ventana InPrivate.
4. No leas ni proyectes `.env.local`. No muestres el QR de MFA, el secreto ni los códigos de respaldo.

### Puntos de recuperación

Guarda snapshots en los tres puntos clave:

```powershell
npm run demo:snapshot -- save antes-gate-2
npm run demo:snapshot -- save antes-gate-4
npm run demo:snapshot -- save antes-reproceso
```

Los snapshots quedan en una carpeta hermana de `LOCAL_DATA_DIR`; contienen una copia consistente de SQLite y los archivos ficticios. Para restaurar, detén `:3140` y usa el mismo nombre:

```powershell
npm run demo:snapshot -- restore antes-reproceso
```

El comando se niega a operar si `LOCAL_DATA_DIR` coincide con la base real o está dentro de ella. No ejecutes `db:seed` ni `demo:seed` sobre la base real.

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
