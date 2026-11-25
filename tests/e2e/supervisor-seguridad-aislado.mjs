import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const port = "3201";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-agil-security-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir, MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
let server;
try {
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/db-migrate.ts"], { cwd: root, env, stdio: "inherit" });
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/db-seed.ts"], { cwd: root, env, stdio: "inherit" });
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], { cwd: root, env, stdio: "inherit" });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const result = spawn(process.execPath, ["tests/e2e/supervisor-seguridad.mjs"], { cwd: root, env: { ...env, BASE: `http://localhost:${port}` }, stdio: "inherit" });
  const code = await new Promise((resolve) => result.on("exit", resolve));
  process.exitCode = code ?? 1;
} finally {
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
