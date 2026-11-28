import { spawn } from "node:child_process";

export async function runSuite(name, args, { cwd, env, echo = true } = {}) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let error;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (echo) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    if (echo) process.stderr.write(chunk);
  });
  child.on("error", (cause) => { error = cause; });
  const { code, signal } = await new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const summaries = [...stdout.matchAll(/(?:RESULTADO|RESULTADO 8d|RESULTADO A0|PASO [67]|SEGURIDAD):\s*(\d+)\s*✅\s*\/\s*(\d+)\s*❌/g)];
  const summary = summaries.at(-1);
  const passed = summary ? Number(summary[1]) : null;
  const failed = summary ? Number(summary[2]) : null;
  return { name, code, signal, error, passed, failed, success: code === 0 && !error && (failed === null || failed === 0) };
}
