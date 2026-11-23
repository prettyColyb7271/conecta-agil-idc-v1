import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const port = process.env.ISOLATED_PORT ?? "3199";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-agil-e2e-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let server;

function runScript(script) {
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), script], { cwd: root, env, stdio: "inherit" });
}

try {
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
