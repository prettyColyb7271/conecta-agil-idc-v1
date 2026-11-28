import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { runSuite } from "./helpers/suite-runner.mjs";
import { acquireRegressionLock } from "./helpers/regression-lock.mjs";

const root = process.cwd();
const port = process.env.ISOLATED_PORT ?? "3199";
let dataDir;
let env;
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const results = [];
let server;
let releaseLock;

async function run(name, args, suiteEnv = env) {
  const result = await runSuite(name, args, { cwd: root, env: suiteEnv });
  results.push(result);
  return result.success;
}

function skip(name, reason) {
  console.error(`${name}: omitida (${reason})`);
  results.push({ name, code: null, passed: null, failed: null, success: false, reason });
}

try {
  releaseLock = await acquireRegressionLock(path.join(os.tmpdir(), "conecta-agil-e2e.lock"));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-agil-e2e-"));
  env = {
    ...process.env,
    APP_MODE: "local",
    NEXT_PUBLIC_MODO: "local",
    LOCAL_DATA_DIR: dataDir,
    MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    MFA_ENCRYPTION_KEY_ANTERIOR: "",
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
  const ports = [Number(port), 3194, 3195, 3196, 3197, 3198, 3201, 3202, 3203, 3204, 3205, 3206, 3207, 3208];
  if (!Number.isInteger(ports[0]) || ports[0] < 1 || ports[0] > 65535 || ports[0] === 3140 || new Set(ports).size !== ports.length) {
    throw new Error("ISOLATED_PORT debe ser un puerto libre distinto de 3140 y de los usados por las suites.");
  }
  for (const candidate of ports) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", () => reject(new Error(`Puerto de pruebas ${candidate} no disponible.`)));
      probe.listen(candidate, "::", () => probe.close(resolve));
    });
  }

  await run("regresiones-pr1", [tsx, "tests/e2e/regresiones-pr1.ts"]);
  await run("migration-004-with-data", [tsx, "tests/e2e/migration-004-with-data.mjs"]);
  await run("migration-010-with-data", ["tests/e2e/migration-010-with-data.mjs"]);
  await run("supervisor-a0-runner", ["tests/e2e/supervisor-a0-runner.mjs"]);
  const migrated = await run("db-migrate", [tsx, "scripts/db-migrate.ts"]);
  let seeded = false;
  if (migrated) seeded = await run("db-seed", [tsx, "scripts/db-seed.ts"]);
  else skip("db-seed", "falló la migración");

  const base = `http://localhost:${port}`;
  let ready = false;
  if (seeded) {
    let serverError;
    server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], { cwd: root, env, stdio: "inherit" });
    server.on("error", (error) => { serverError = error; });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !serverError && server.exitCode === null && server.signalCode === null) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready) {
      const reason = serverError?.message ?? "el servidor aislado no respondió";
      console.error(`Servidor aislado: ${reason}`);
      results.push({ name: "servidor aislado", code: null, passed: null, failed: null, success: false, reason });
    }
  }

  const suites = [
    ["supervisor-pasos-1-4", ["tests/e2e/supervisor-pasos-1-4.mjs"], true],
    ["supervisor-documentos", ["tests/e2e/supervisor-documentos.mjs", root], false],
    ["supervisor-paso6", ["tests/e2e/supervisor-paso6.mjs"], true],
    ["supervisor-gestores", ["tests/e2e/supervisor-gestores.mjs", root], false],
    ["supervisor-flujo-g0-g2", ["tests/e2e/supervisor-flujo-g0-g2.mjs", root], false],
    ["supervisor-a1-firma-ui", ["tests/e2e/supervisor-a1-firma-ui.mjs", root], false],
    ["supervisor-a3", ["tests/e2e/supervisor-a3.mjs", root], false],
    ["supervisor-paso7", ["tests/e2e/supervisor-paso7.mjs"], true],
    ["supervisor-flujo-g3-g7", ["tests/e2e/supervisor-flujo-g3-g7.mjs", root], false],
    ["corrida-ui-g0-g7", ["tests/e2e/corrida-ui-g0-g7.mjs", root], false],
    ["supervisor-seguridad-aislado", ["tests/e2e/supervisor-seguridad-aislado.mjs"], false],
    ["supervisor-seguridad-ataque", ["tests/e2e/supervisor-seguridad-ataque.mjs", root], false],
    ["supervisor-origen-8d", ["tests/e2e/supervisor-origen-8d.mjs", root], false],
    ["supervisor-a4", ["tests/e2e/supervisor-a4.mjs", root], false],
    ["supervisor-zoho-api", ["tests/e2e/supervisor-zoho-api.mjs", root], false],
    ["supervisor-mfa-rotacion", ["tests/e2e/supervisor-mfa-rotacion.mjs", root], false],
    ["supervisor-a7-admin", ["tests/e2e/supervisor-a7-admin.mjs", root], false],
  ];
  for (const [name, args, needsSharedServer] of suites) {
    if (needsSharedServer && !ready) skip(name, "servidor compartido no disponible");
    else await run(name, args, needsSharedServer ? { ...env, BASE: base } : env);
  }
} catch (error) {
  console.error("Error en la regresión aislada:", error);
  process.exitCode = 1;
} finally {
  if (server && !server.killed) {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (let attempt = 0; dataDir && attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 4) {
        console.error("No se pudieron eliminar los datos temporales:", error);
        process.exitCode = 1;
      } else await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  console.log("\nRESUMEN DE REGRESIÓN:");
  for (const result of results) {
    const exit = result.code ?? (result.signal ? `señal ${result.signal}` : "sin código");
    const counts = result.passed === null ? "sin conteo" : `${result.passed} ✅ / ${result.failed} ❌`;
    const detail = result.error?.message ?? result.reason;
    console.log(`${result.name} → exit ${exit} → ${counts}${detail ? ` (${detail})` : ""}`);
  }
  if (results.some((result) => !result.success)) process.exitCode = 1;
  if (releaseLock) {
    try {
      releaseLock();
    } catch (error) {
      console.error("No se pudo liberar el candado de regresión:", error);
      process.exitCode = 1;
    }
  }
}
