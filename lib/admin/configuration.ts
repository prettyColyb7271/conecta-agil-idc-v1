import "server-only";

import fs from "node:fs";
import path from "node:path";
import { ROLE_LABEL, type Role } from "@/data/mock";
import { getAppMode, getLocalDataDir } from "@/lib/adapters/config";
import { getDatabase, getDatabasePath, getSchemaVersion } from "@/lib/db/sqlite";
import { SESSION_HOURS } from "@/lib/auth";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export type AdminConfiguration = {
  mode: "local" | "demo";
  version: string;
  schemaVersion: number | null;
  serverTime: string;
  storageLocation: string;
  databaseBytes: number | null;
  documentsBytes: number | null;
  emailTransport: "file" | "resend";
  emailSenderConfigured: boolean;
  zohoTransport: "file" | "api";
  zohoLastSuccessAt: string | null;
  zohoFailed: number;
  requiredMfaRoles: string[];
  sessionHours: number;
  minimumPasswordLength: number;
  mfaRotationAt: string | null;
};

function directorySize(directory: string): number {
  if (!fs.existsSync(directory)) return 0;
  let total = 0;
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += fs.statSync(target).size;
    }
  }
  return total;
}

function packageVersion(): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version?: unknown };
  return typeof manifest.version === "string" ? manifest.version : "desconocida";
}

function shortCommit(): string | null {
  const candidate = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT;
  return candidate && /^[0-9a-f]{7,40}$/i.test(candidate) ? candidate.slice(0, 7) : null;
}

function requiredMfaRoles(): Role[] {
  const configured = (process.env.MFA_REQUIRED_ROLES ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role => ROLES.includes(role as Role));
  return [...new Set<Role>(["admin_seguridad", ...configured])];
}

function sizeOfDatabaseFiles(databasePath: string): number {
  return ["", "-wal", "-shm"].reduce((total, suffix) => {
    const target = `${databasePath}${suffix}`;
    return fs.existsSync(target) ? total + fs.statSync(target).size : total;
  }, 0);
}

export function getAdminConfiguration(): AdminConfiguration {
  const mode = getAppMode();
  const configuredEmailTransport = process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "file";
  if (configuredEmailTransport !== "file" && configuredEmailTransport !== "resend") {
    throw new Error("EMAIL_TRANSPORT debe ser file o resend.");
  }
  const configuredZohoTransport = process.env.ZOHO_TRANSPORT?.trim().toLowerCase() || "file";
  if (configuredZohoTransport !== "file" && configuredZohoTransport !== "api") {
    throw new Error("ZOHO_TRANSPORT debe ser file o api.");
  }
  const dataDirectory = getLocalDataDir();
  const outsideOneDrive = !dataDirectory.toLowerCase().includes("onedrive");
  let schemaVersion: number | null = null;
  let databaseBytes: number | null = null;
  let documentsBytes: number | null = null;
  let zohoLastSuccessAt: string | null = null;
  let zohoFailed = 0;
  let mfaRotationAt: string | null = null;

  if (mode === "local") {
    const database = getDatabase();
    schemaVersion = getSchemaVersion(database);
    databaseBytes = sizeOfDatabaseFiles(getDatabasePath());
    documentsBytes = directorySize(path.join(dataDirectory, "documents"));
    const outbox = database.prepare(`
      SELECT MAX(CASE WHEN status = 'enviado' THEN last_attempt_at END) AS last_success,
             SUM(CASE WHEN status = 'fallido' THEN 1 ELSE 0 END) AS failed
      FROM outbox
    `).get() as { last_success: string | null; failed: number | null };
    zohoLastSuccessAt = outbox.last_success;
    zohoFailed = Number(outbox.failed ?? 0);
    const rotation = database.prepare(
      "SELECT MAX(created_at) AS latest FROM audit_events WHERE event_type = 'mfa_clave_rotada'",
    ).get() as { latest: string | null };
    mfaRotationAt = rotation.latest;
  }

  return {
    mode,
    version: shortCommit() ?? packageVersion(),
    schemaVersion,
    serverTime: new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Hermosillo",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date()),
    storageLocation: mode === "demo"
      ? "No aplica: el modo demo no usa almacenamiento local."
      : outsideOneDrive ? "Carpeta local fuera de OneDrive" : "La ubicación requiere revisión; no se muestra la ruta.",
    databaseBytes,
    documentsBytes,
    emailTransport: configuredEmailTransport,
    emailSenderConfigured: Boolean(process.env.EMAIL_FROM?.trim()),
    zohoTransport: configuredZohoTransport,
    zohoLastSuccessAt,
    zohoFailed,
    requiredMfaRoles: requiredMfaRoles().map((role) => ROLE_LABEL[role]),
    sessionHours: SESSION_HOURS,
    minimumPasswordLength: 12,
    mfaRotationAt,
  };
}
