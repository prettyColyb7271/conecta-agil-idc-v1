import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const port = process.env.ISOLATED_PORT ?? "3199";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-agil-e2e-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let server;

function npm(command) {
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command], { cwd: root, env, stdio: "inherit", shell: true });
}

try {
  npm("db:migrate");
  npm("db:seed");
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
