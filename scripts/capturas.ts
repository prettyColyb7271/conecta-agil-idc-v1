import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.resolve(root, "docs", "reporte", "capturas");
const names = [
  "01-inicio-sesion.png",
  "02-preferencias-modo-oscuro.png",
  "03-solicitud-registro.png",
  "04-seguridad-mfa-sin-qr.png",
  "05-portal-privacidad-captura.png",
  "06-portal-documentos-observacion.png",
  "07-portal-avance-gate-5.png",
  "08-formatos-cfe-vista-previa.png",
  "09-gestor-inicio-indicadores.png",
  "10-proyectos-alta-asignacion.png",
  "11-revision-validacion-requisitos.png",
  "12-revision-flujo-firma.png",
  "13-revision-acuse-cfe.png",
  "14-revision-oficio-vigencia.png",
  "15-revision-inspeccion-uiie.png",
  "16-revision-cierre-gate-8.png",
  "17-admin-cuentas.png",
  "18-admin-bitacora.png",
  "19-admin-integraciones-zoho.png",
  "20-portal-cliente-movil.png",
  "21-admin-inicio-seguridad.png",
  "22-reproceso-cfe-semaforo.png",
];
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  CAPTURAS: "1",
  CAPTURAS_DIR: outputDir,
  MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  MFA_REQUIRED_ROLES: "admin_seguridad",
  EMAIL_TRANSPORT: "file",
  EMAIL_FROM: "Conecta Agil <no-reply@example.invalid>",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
  ZOHO_DC: "com",
};

const child = spawn(process.execPath, ["tests/e2e/corrida-ui-g0-g7.mjs", root], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error("No se pudo iniciar la generación aislada de capturas.", error);
  process.exitCode = 1;
});

child.once("exit", (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  try {
    for (const [index, name] of names.entries()) {
      const file = path.join(outputDir, name);
      if (!fs.existsSync(file)) throw new Error(`Falta la captura ${name}.`);
      const bytes = fs.readFileSync(file);
      if (bytes.length < 100 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error(`La captura ${name} no es un PNG válido.`);
      }
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (index === 18) {
        if (width < 900 || height < 768) throw new Error(`La captura ${name} debe mostrar completo el panel de Zoho; mide ${width}x${height}.`);
      } else {
        const expected = index === 19 ? [390, 844] : [1366, 768];
        if (width !== expected[0] || height !== expected[1]) {
          throw new Error(`La captura ${name} no tiene el tamaño esperado ${expected.join("x")}.`);
        }
      }
    }
    console.log(`Capturas verificadas: ${names.length}; la maqueta Zoho muestra el panel completo y la vista móvil mide 390×844.`);
  } catch (error) {
    console.error("La verificación de capturas falló.", error);
    process.exitCode = 1;
  }
});
