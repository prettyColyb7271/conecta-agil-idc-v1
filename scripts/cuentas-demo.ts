import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "@/lib/db/sqlite-runtime";
import { createPasswordSetupToken, DEMO_SEED_PASSWORD, generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/password-setup";
import { assertSafeDemoDataDir } from "./demo-safety";

const setupFileName = "CUENTAS_DEMO.local.md";
const setupAccounts = [
  { email: "cliente.demo@example.invalid", role: "cliente", label: "Cliente" },
  { email: "coordinador.demo@example.invalid", role: "coordinador_idc", label: "Gestor 1" },
  { email: "idc2.demo@example.invalid", role: "coordinador_idc", label: "Gestor 2" },
  { email: "seguridad.demo@example.invalid", role: "admin_seguridad", label: "Administrador" },
] as const;

type DemoAccount = {
  id: string;
  email: string;
  role: string;
  status: string;
  must_change_password: number;
  password_hash: string;
};

function resetEmailArgument(args: string[]): string | null {
  if (args.length === 0) return null;
  if (args.length !== 2 || args[0] !== "--reiniciar" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1])) {
    throw new Error("Uso: npm run cuentas:demo [-- --reiniciar correo-demo]");
  }
  return args[1].trim().toLowerCase();
}

function baseUrl(): URL {
  const configured = process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:3140";
  const value = new URL(configured);
  if (!["http:", "https:"].includes(value.protocol) || value.username || value.password) {
    throw new Error("PUBLIC_BASE_URL debe ser una URL HTTP(S) sin credenciales.");
  }
  return new URL("/", value.origin);
}

function inTransaction<T>(work: () => T): T {
  const database = getDatabase();
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function main(): void {
  const dataDir = assertSafeDemoDataDir();
  const databasePath = path.join(dataDir, "conecta-agil.sqlite");
  if (!fs.existsSync(databasePath)) throw new Error("No existe la base ficticia; prepara primero la demo aislada.");

  const resetEmail = resetEmailArgument(process.argv.slice(2));
  const database = getDatabase();
  const accounts = setupAccounts.map((expected) => {
    const account = database.prepare(
      "SELECT id, email, role, status, must_change_password, password_hash FROM users WHERE lower(email) = lower(?)",
    ).get(expected.email) as DemoAccount | undefined;
    if (!account || account.role !== expected.role || account.status !== "activo") {
      throw new Error("La base aislada no contiene las cuatro cuentas demo activas esperadas.");
    }
    return { ...expected, ...account };
  });
  if (resetEmail && !accounts.some((account) => account.email.toLowerCase() === resetEmail)) {
    throw new Error("El correo indicado no corresponde a una de las cuentas demo.");
  }
  const administrator = accounts.find((account) => account.role === "admin_seguridad");
  if (!administrator) throw new Error("No se encontró la cuenta admin demo.");

  const pending = accounts.filter((account) => {
    if (account.email.toLowerCase() === resetEmail) return true;
    if (account.must_change_password === 1) return true;
    const hasSetupHistory = database.prepare("SELECT 1 FROM password_setup_tokens WHERE user_id = ? LIMIT 1").get(account.id);
    return !hasSetupHistory && verifyPassword(DEMO_SEED_PASSWORD, account.password_hash);
  });
  const rootUrl = baseUrl();
  const issued = inTransaction(() => pending.map((account) => {
    database.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?")
      .run(hashPassword(generateTemporaryPassword()), new Date().toISOString(), account.id);
    database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), account.id);
    const setup = createPasswordSetupToken(account.id, administrator.id, 72);
    const url = new URL("/definir-contrasena", rootUrl);
    url.searchParams.set("token", setup.token);
    return { label: account.label, email: account.email, url: url.toString(), expiresAt: setup.expiresAt };
  }));

  const content = [
    "# Enlaces personales de demo",
    "",
    "Cada enlace es de un solo uso y vence en 72 horas. Comparte cada enlace únicamente con la persona indicada.",
    "No guardes este archivo en el repositorio ni lo incluyas en capturas o reportes.",
    "",
    ...issued.map((account) => `- **${account.label}** (${account.email}) — vence ${account.expiresAt}: [Definir contraseña](${account.url})`),
    ...(issued.length ? [] : ["No hay enlaces nuevos: las cuentas ya definieron su contraseña."]),
    "",
  ].join("\n");
  const outputPath = path.join(dataDir, setupFileName);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
  console.log(`Enlaces escritos en ${outputPath}`);
}

try {
  main();
} catch (error) {
  console.error("No se pudieron preparar las cuentas de demo.", error);
  process.exitCode = 1;
}
