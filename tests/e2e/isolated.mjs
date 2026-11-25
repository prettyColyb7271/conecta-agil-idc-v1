import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const port = process.env.ISOLATED_PORT ?? "3199";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-agil-e2e-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir, MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
let server;

function runScript(script) {
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), script], { cwd: root, env, stdio: "inherit" });
}

try {
  runScript("tests/e2e/migration-004-with-data.mjs");
  runScript("scripts/db-migrate.ts");
  runScript("scripts/db-seed.ts");
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], { cwd: root, env, stdio: "inherit" });
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const health = await fetch(`${base}/api/health`);
  if (!health.ok) throw new Error(`Servidor aislado no respondió: ${health.status}`);
  const result = spawn(process.execPath, ["tests/e2e/supervisor-pasos-1-4.mjs"], { cwd: root, env: { ...env, BASE: base }, stdio: "inherit" });
  const code = await new Promise((resolve) => result.on("exit", resolve));
  if (code !== 0) process.exitCode = code ?? 1;
  const docs = spawn(process.execPath, ["tests/e2e/supervisor-documentos.mjs", root], { cwd: root, env, stdio: "inherit" });
  const docsCode = await new Promise((resolve) => docs.on("exit", resolve));
  if (docsCode !== 0) process.exitCode = docsCode ?? 1;
  const paso6 = spawn(process.execPath, ["tests/e2e/supervisor-paso6.mjs"], { cwd: root, env: { ...env, BASE: base }, stdio: "inherit" });
  const paso6Code = await new Promise((resolve) => paso6.on("exit", resolve));
  if (paso6Code !== 0) process.exitCode = paso6Code ?? 1;
  const gestores = spawn(process.execPath, ["tests/e2e/supervisor-gestores.mjs", root], { cwd: root, env, stdio: "inherit" });
  const gestoresCode = await new Promise((resolve) => gestores.on("exit", resolve));
  if (gestoresCode !== 0) process.exitCode = gestoresCode ?? 1;
  const flujo = spawn(process.execPath, ["tests/e2e/supervisor-flujo-g0-g2.mjs", root], { cwd: root, env, stdio: "inherit" });
  const flujoCode = await new Promise((resolve) => flujo.on("exit", resolve));
  if (flujoCode !== 0) process.exitCode = flujoCode ?? 1;
  const paso7 = spawn(process.execPath, ["tests/e2e/supervisor-paso7.mjs"], { cwd: root, env: { ...env, BASE: base }, stdio: "inherit" });
  const paso7Code = await new Promise((resolve) => paso7.on("exit", resolve));
  if (paso7Code !== 0) process.exitCode = paso7Code ?? 1;
  const flujoG3G7 = spawn(process.execPath, ["tests/e2e/supervisor-flujo-g3-g7.mjs", root], { cwd: root, env, stdio: "inherit" });
  const flujoG3G7Code = await new Promise((resolve) => flujoG3G7.on("exit", resolve));
  if (flujoG3G7Code !== 0) process.exitCode = flujoG3G7Code ?? 1;
  const seguridad = spawn(process.execPath, ["tests/e2e/supervisor-seguridad-aislado.mjs"], { cwd: root, env, stdio: "inherit" });
  const seguridadCode = await new Promise((resolve) => seguridad.on("exit", resolve));
  if (seguridadCode !== 0) process.exitCode = seguridadCode ?? 1;
} finally {
  if (server && !server.killed) {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
