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
type CachedToken = { value: string; expiresAt: number };

let cachedToken: CachedToken | null = null;
let tokenRequest: Promise<string> | null = null;
const deliveryQueues = new Map<string, Promise<void>>();

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

async function accessToken(forceRenew = false, rejectedToken?: string): Promise<string> {
  if (forceRenew && rejectedToken && cachedToken?.value !== rejectedToken && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  if (forceRenew) cachedToken = null;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (tokenRequest) return tokenRequest;

  const clientId = process.env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET y ZOHO_REFRESH_TOKEN son obligatorios para el transporte api.");
  const accountsRoot = process.env.ZOHO_ACCOUNTS_URL?.trim().replace(/\/+$/, "") || `https://accounts.zoho.${dataCenterDomain()}`;
  const accountsUrl = `${accountsRoot}/oauth/v2/token`;
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(accountsUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    } catch {
      throw new Error("No se pudo conectar con el servicio OAuth de Zoho.");
    }
    if (response.status === 429) throw new Error("Zoho limitó las peticiones; usa Reintentar en unos minutos.");
    if (!response.ok) throw new Error(`Zoho OAuth rechazó la solicitud (HTTP ${response.status}).`);
    const result = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof result.access_token !== "string" || !result.access_token) throw new Error("Zoho OAuth no devolvió un token de acceso.");
    const expiresIn = typeof result.expires_in === "number" && Number.isFinite(result.expires_in) && result.expires_in > 0
      ? result.expires_in
      : 50 * 60;
    cachedToken = { value: result.access_token, expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000 };
    return result.access_token;
  })();
  tokenRequest = request;
  try {
    return await request;
  } finally {
    if (tokenRequest === request) tokenRequest = null;
  }
}

async function sendZohoRequest(url: string, token: string, body: URLSearchParams): Promise<Response> {
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
  return response;
}

async function zohoRequest(url: string, body: URLSearchParams): Promise<unknown> {
  let token = await accessToken();
  let response = await sendZohoRequest(url, token, body);
  if (response.status === 401) {
    token = await accessToken(true, token);
    response = await sendZohoRequest(url, token, body);
  }
  if (response.status === 429) {
    throw new Error("Zoho limitó las peticiones; usa Reintentar en unos minutos.");
  }
  if (!response.ok) {
    throw new Error(`Zoho Projects rechazó la solicitud (HTTP ${response.status}).`);
  }
  return response.json();
}

function responseTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const tasks = (value as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks) || !tasks[0] || typeof tasks[0] !== "object") return null;
  const task = tasks[0] as { id?: unknown; id_string?: unknown };
  if (typeof task.id_string === "string" && /^\d+$/.test(task.id_string)) return task.id_string;
  if (typeof task.id === "string" && /^\d+$/.test(task.id)) return task.id;
  if (typeof task.id === "number" && Number.isSafeInteger(task.id) && task.id >= 0) return String(task.id);
  return null;
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

function taskChanged(previous: ZohoSnapshot["tasks"][number] | undefined, current: ZohoSnapshot["tasks"][number]): boolean {
  if (!previous) return true;
  return previous.status !== current.status ||
    previous.openedAt !== current.openedAt ||
    previous.closedAt !== current.closedAt ||
    previous.responsible !== current.responsible ||
    JSON.stringify(previous.subtasks) !== JSON.stringify(current.subtasks);
}

function lastSuccessfulApiSnapshot(expedienteId: string): { zoho_id: string; payload_json: string } | undefined {
  const rows = getDatabase().prepare(`
    SELECT zoho_id, payload_json FROM outbox
    WHERE expediente_id = ? AND status = 'enviado' AND zoho_id IS NOT NULL
    ORDER BY created_at DESC, rowid DESC
  `).all(expedienteId) as Array<{ zoho_id: string; payload_json: string }>;
  return rows.find((candidate) => Object.keys(safeIds(candidate.zoho_id).gates).length > 0);
}

function lastKnownApiIds(expedienteId: string): string | null {
  const rows = getDatabase().prepare(`
    SELECT zoho_id FROM outbox
    WHERE expediente_id = ? AND zoho_id IS NOT NULL
    ORDER BY created_at DESC, rowid DESC
  `).all(expedienteId) as Array<{ zoho_id: string }>;
  return rows.find((candidate) => Object.keys(safeIds(candidate.zoho_id).gates).length > 0)?.zoho_id ?? null;
}

async function sendToApi(row: OutboxRow, snapshot: ZohoSnapshot): Promise<string> {
  const portal = process.env.ZOHO_PORTAL_ID?.trim();
  const project = process.env.ZOHO_PROJECT_ID?.trim();
  if (!portal || !project) throw new Error("ZOHO_PORTAL_ID y ZOHO_PROJECT_ID son obligatorios para el transporte api.");
  const domain = dataCenterDomain();
  const projectsApiRoot = process.env.ZOHO_PROJECTS_API_URL?.trim().replace(/\/+$/, "") || `https://projectsapi.zoho.${domain}`;
  const root = `${projectsApiRoot}/restapi/portal/${encodeURIComponent(portal)}/projects/${encodeURIComponent(project)}/tasks`;
  const previous = lastSuccessfulApiSnapshot(row.expediente_id);
  const ids = safeIds(row.zoho_id ?? lastKnownApiIds(row.expediente_id) ?? previous?.zoho_id ?? null);
  const previousTasks = previous ? (JSON.parse(previous.payload_json) as ZohoSnapshot).tasks : [];

  for (const task of snapshot.tasks) {
    const taskId = ids.gates[String(task.gate)];
    const previousTask = previousTasks.find((item) => item.gate === task.gate);
    if (taskId && !taskChanged(previousTask, task)) continue;
    const body = new URLSearchParams({
      name: `${snapshot.folio} - ${task.label}`,
      description: description(snapshot, task),
      percent_complete: task.status === "Cerrado" ? "100" : task.status === "Pendiente" ? "0" : "50",
    });
    const url = taskId ? `${root}/${encodeURIComponent(taskId)}/` : `${root}/`;
    const result = await zohoRequest(url, body);
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

function pendingRows(expedienteId: string): Array<{ id: string }> {
  return getDatabase().prepare(`
    SELECT id FROM outbox
    WHERE expediente_id = ? AND status = 'pendiente'
    ORDER BY created_at, rowid
  `).all(expedienteId) as Array<{ id: string }>;
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

async function drainExpedienteQueue(expedienteId: string): Promise<void> {
  while (true) {
    const pending = pendingRows(expedienteId);
    if (pending.length === 0) return;

    const transport = process.env.ZOHO_TRANSPORT?.trim().toLowerCase() || "file";
    if (transport !== "file" && transport !== "api") throw new Error("ZOHO_TRANSPORT debe ser file o api.");
    const selected = transport === "api" ? pending.at(-1)! : pending[0];
    const consolidated = transport === "api" ? pending.slice(0, -1) : [];
    const result = await deliver(selected.id);

    if (consolidated.length > 0) {
      const marker = JSON.stringify({ consolidadoEn: selected.id });
      const update = getDatabase().prepare(`
        UPDATE outbox
        SET status = 'enviado', last_error = NULL, last_attempt_at = ?, zoho_id = ?
        WHERE id = ? AND status = 'pendiente'
      `);
      for (const row of consolidated) update.run(result.last_attempt_at, marker, row.id);
    }
  }
}

function queueExpedienteDelivery(expedienteId: string): Promise<void> {
  const previous = deliveryQueues.get(expedienteId) ?? Promise.resolve();
  const next = previous
    .catch((error: unknown) => {
      console.error("Falló una cola previa de Zoho.", error);
    })
    .then(() => drainExpedienteQueue(expedienteId));
  deliveryQueues.set(expedienteId, next);
  const clear = () => {
    if (deliveryQueues.get(expedienteId) === next) deliveryQueues.delete(expedienteId);
  };
  void next.then(clear, clear);
  return next;
}

export function scheduleZohoDelivery(id: string): void {
  const row = readRow(id);
  if (!row) {
    console.error("No se pudo programar el envío a Zoho: la fila no existe.");
    return;
  }
  void queueExpedienteDelivery(row.expediente_id).catch((error: unknown) => {
    console.error("No se pudo completar el envío a Zoho.", error);
  });
}

export async function retryZohoDelivery(id: string): Promise<OutboxRow> {
  const row = readRow(id);
  if (!row) throw new Error("OUTBOX_NOT_FOUND");
  if (row.status === "enviado") throw new Error("OUTBOX_ALREADY_SENT");
  const now = Date.now();
  const pendingIsStale = row.status === "pendiente" && Number.isFinite(Date.parse(row.created_at)) &&
    now - Date.parse(row.created_at) > 60_000;
  const sendingIsStale = row.status === "enviando" && row.last_attempt_at !== null &&
    Number.isFinite(Date.parse(row.last_attempt_at)) && now - Date.parse(row.last_attempt_at) > 120_000;
  if (row.status === "enviando" && !sendingIsStale) throw new Error("OUTBOX_IN_PROGRESS");
  if (row.status === "pendiente" && !pendingIsStale) throw new Error("OUTBOX_IN_PROGRESS");
  getDatabase().prepare("UPDATE outbox SET status = 'pendiente', last_error = NULL WHERE id = ?").run(id);
  await queueExpedienteDelivery(row.expediente_id);
  const result = readRow(id);
  if (!result) throw new Error("El envío de Zoho desapareció después de reintentarse.");
  return result;
}
