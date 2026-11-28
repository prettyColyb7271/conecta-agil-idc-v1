import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "@/lib/db/sqlite";
import { getLocalDataDir } from "@/lib/adapters/config";
import type { ZohoSnapshot } from "@/lib/zoho/outbox";

type OutboxRow = {
  id: string;
  event_type: string;
  expediente_id: string;
  payload_json: string;
  status: "pendiente" | "enviando" | "enviado" | "fallido";
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  zoho_id: string | null;
  created_at: string;
};

type ZohoIds = { gates: Record<string, string> };

const dataCenters: Record<string, string> = {
  com: "com",
  eu: "eu",
  in: "in",
  au: "com.au",
  jp: "jp",
  ca: "ca",
  sa: "sa",
};

function dataCenterDomain(): string {
  const key = process.env.ZOHO_DC?.trim().toLowerCase() || "com";
  const domain = dataCenters[key];
  if (!domain) throw new Error("ZOHO_DC debe ser com, eu, in, au, jp, ca o sa.");
  return domain;
}

function safeIds(value: string | null): ZohoIds {
  if (!value) return { gates: {} };
  try {
    const parsed = JSON.parse(value) as ZohoIds;
    return parsed && typeof parsed.gates === "object" && parsed.gates !== null
      ? { gates: Object.fromEntries(Object.entries(parsed.gates).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }
      : { gates: {} };
  } catch {
    return { gates: {} };
  }
}

function saveZohoIds(id: string, ids: ZohoIds): void {
  getDatabase().prepare("UPDATE outbox SET zoho_id = ? WHERE id = ?").run(JSON.stringify(ids), id);
}

async function sendToFile(row: OutboxRow, snapshot: ZohoSnapshot): Promise<string> {
  const directory = path.join(getLocalDataDir(), "zoho-outbox");
  const destination = path.join(directory, `${row.created_at.replaceAll(/[^0-9A-Za-z._-]/g, "_")}-${row.id}.json`);
  const temporary = `${destination}.tmp`;
  try {
    await fs.mkdir(directory, { recursive: true });
    try {
      const existing = JSON.parse(await fs.readFile(destination, "utf8")) as { outboxId?: string };
      if (existing.outboxId === row.id) return `file:${row.id}`;
      throw new Error("El archivo destino de Zoho no corresponde al envío.");
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
    await fs.writeFile(temporary, JSON.stringify({ outboxId: row.id, eventType: row.event_type, payload: snapshot }, null, 2), { flag: "wx" });
    await fs.rename(temporary, destination);
    return `file:${row.id}`;
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "error";
    throw new Error(`No se pudo escribir el archivo de Zoho (${code}).`);
  }
}

async function accessToken(): Promise<string> {
  const clientId = process.env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET y ZOHO_REFRESH_TOKEN son obligatorios para el transporte api.");
  const accountsUrl = `https://accounts.zoho.${dataCenterDomain()}/oauth/v2/token`;
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
  let response: Response;
  try {
    response = await fetch(accountsUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  } catch {
    throw new Error("No se pudo conectar con el servicio OAuth de Zoho.");
  }
  if (!response.ok) throw new Error(`Zoho OAuth rechazó la solicitud (HTTP ${response.status}).`);
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("Zoho OAuth no devolvió un token de acceso.");
  return result.access_token;
}

async function zohoRequest(url: string, token: string, body: URLSearchParams): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new Error("No se pudo conectar con Zoho Projects.");
  }
  if (!response.ok) throw new Error(`Zoho Projects rechazó la solicitud (HTTP ${response.status}).`);
  return response.json();
}

function responseTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const data = value as { tasks?: Array<{ id?: string | number }> };
  const id = data.tasks?.[0]?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function description(snapshot: ZohoSnapshot, gate: ZohoSnapshot["tasks"][number]): string {
  const subtasks = gate.subtasks.map((item) => `${item.label}: ${item.status}${item.date ? ` (${item.date})` : ""}`).join("\n");
  return [
    `Folio: ${snapshot.folio}`,
    `Estado: ${gate.status}`,
    `Responsable: ${gate.responsible}`,
    gate.openedAt ? `Registro: ${gate.openedAt}` : "",
    gate.closedAt ? `Cierre: ${gate.closedAt}` : "",
    subtasks,
  ].filter(Boolean).join("\n");
}

async function sendToApi(row: OutboxRow, snapshot: ZohoSnapshot): Promise<string> {
  const portal = process.env.ZOHO_PORTAL_ID?.trim();
  const project = process.env.ZOHO_PROJECT_ID?.trim();
  if (!portal || !project) throw new Error("ZOHO_PORTAL_ID y ZOHO_PROJECT_ID son obligatorios para el transporte api.");
  const token = await accessToken();
  const domain = dataCenterDomain();
  const root = `https://projectsapi.zoho.${domain}/restapi/portal/${encodeURIComponent(portal)}/projects/${encodeURIComponent(project)}/tasks`;
  const previous = getDatabase().prepare(`
    SELECT zoho_id FROM outbox WHERE expediente_id = ? AND id != ? AND zoho_id IS NOT NULL
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get(row.expediente_id, row.id) as { zoho_id: string } | undefined;
  const ids = safeIds(row.zoho_id ?? previous?.zoho_id ?? null);

  for (const task of snapshot.tasks) {
    const body = new URLSearchParams({
      name: `${snapshot.folio} - ${task.label}`,
      description: description(snapshot, task),
      percent_complete: task.status === "Cerrado" ? "100" : task.status === "Pendiente" ? "0" : "50",
    });
    const taskId = ids.gates[String(task.gate)];
    const url = taskId ? `${root}/${encodeURIComponent(taskId)}/` : `${root}/`;
    const result = await zohoRequest(url, token, body);
    const returnedId = responseTaskId(result);
    if (!taskId && !returnedId) throw new Error("Zoho Projects no devolvió el identificador de una tarea.");
    ids.gates[String(task.gate)] = taskId ?? returnedId!;
    saveZohoIds(row.id, ids);
  }
  return JSON.stringify(ids);
}

function readRow(id: string): OutboxRow | undefined {
  return getDatabase().prepare(`
    SELECT id, event_type, expediente_id, payload_json, status, attempts, last_error, last_attempt_at, zoho_id, created_at
    FROM outbox WHERE id = ?
  `).get(id) as OutboxRow | undefined;
}

async function deliver(id: string): Promise<OutboxRow> {
  const database = getDatabase();
  const claimed = database.prepare(`
    UPDATE outbox SET status = 'enviando', attempts = attempts + 1, last_attempt_at = ?, last_error = NULL
    WHERE id = ? AND status = 'pendiente'
  `).run(new Date().toISOString(), id) as { changes: number };
  let row = readRow(id);
  if (!row) throw new Error("El envío de Zoho no existe.");
  if (Number(claimed.changes) !== 1) return row;

  try {
    const snapshot = JSON.parse(row.payload_json) as ZohoSnapshot;
    const transport = process.env.ZOHO_TRANSPORT?.trim().toLowerCase() || "file";
    let zohoId: string;
    if (transport === "file") zohoId = await sendToFile(row, snapshot);
    else if (transport === "api") zohoId = await sendToApi(row, snapshot);
    else throw new Error("ZOHO_TRANSPORT debe ser file o api.");
    database.prepare("UPDATE outbox SET status = 'enviado', zoho_id = ?, last_error = NULL WHERE id = ?").run(zohoId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al enviar a Zoho.";
    database.prepare("UPDATE outbox SET status = 'fallido', last_error = ? WHERE id = ?").run(message.slice(0, 500), id);
  }
  row = readRow(id);
  if (!row) throw new Error("El envío de Zoho desapareció después de procesarse.");
  return row;
}

export function scheduleZohoDelivery(id: string): void {
  void deliver(id).catch((error: unknown) => {
    console.error("No se pudo completar el envío a Zoho.", error);
  });
}

export async function retryZohoDelivery(id: string): Promise<OutboxRow> {
  const row = readRow(id);
  if (!row) throw new Error("OUTBOX_NOT_FOUND");
  if (row.status === "enviado") throw new Error("OUTBOX_ALREADY_SENT");
  if (row.status === "enviando") throw new Error("OUTBOX_IN_PROGRESS");
  getDatabase().prepare("UPDATE outbox SET status = 'pendiente', last_error = NULL WHERE id = ? AND status = 'fallido'").run(id);
  return deliver(id);
}
