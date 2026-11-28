import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const appPort = 3206;
const base = `http://localhost:${appPort}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-zoho-api-"));
const state = {
  tokenCalls: 0,
  currentToken: "",
  nextId: 2750569000000118003n,
  nextCreationResponse: null,
  reject401Once: false,
  reject429Once: false,
  failAfterCreates: null,
  pausedProjectRequest: null,
  tasks: new Map(),
  requests: [],
};
let simulator;
let server;
let database;
let simulatorBase;
let pass = 0;
let fail = 0;
const failures = [];

const ok = (name, condition, detail = "") => {
  if (condition) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    failures.push(name);
    console.log("  ❌", name, detail);
  }
};

class Session {
  cookies = {};
  async request(method, route, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    if (body !== undefined) headers.origin = base;
    if (body !== undefined && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(`${base}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      redirect: "manual",
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const content = pair.slice(index + 1);
      if (content) this.cookies[key] = content;
      else delete this.cookies[key];
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    return { status: response.status, text, json };
  }
  get(route) { return this.request("GET", route); }
  post(route, body) { return this.request("POST", route, body); }
}

function must(name, response, expected) {
  ok(name, response.status === expected, response.json?.error ?? response.text.slice(0, 100));
  if (response.status !== expected) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of value) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

function rowsForExpediente(expedienteId) {
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  try {
    return db.prepare(`
      SELECT id, event_type, payload_json, status, attempts, last_error, last_attempt_at, zoho_id, created_at
      FROM outbox WHERE expediente_id = ? ORDER BY created_at, rowid
    `).all(expedienteId);
  } finally {
    db.close();
  }
}

function updateOutboxRow(id, status, lastAttemptAt, createdAt = null) {
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  try {
    db.prepare("UPDATE outbox SET status = ?, last_attempt_at = ?, created_at = COALESCE(?, created_at) WHERE id = ?")
      .run(status, lastAttemptAt, createdAt, id);
  } finally {
    db.close();
  }
}

function insertOutboxRow(expedienteId, eventType, snapshot, status, zohoId, createdAt) {
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const id = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO outbox (id, event_type, expediente_id, payload_json, status, attempts, zoho_id, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, eventType, expedienteId, JSON.stringify(snapshot), status, zohoId, createdAt);
  } finally {
    db.close();
  }
  return id;
}

function consolidatedInto(row) {
  try { return JSON.parse(row.zoho_id).consolidadoEn ?? null; } catch { return null; }
}

async function waitFor(predicate, message, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function waitForExpediente(expedienteId, status) {
  await waitFor(() => {
    const rows = rowsForExpediente(expedienteId);
    return rows.length > 0 && rows.every((row) => row.status === status);
  }, `Los envíos de ${expedienteId} no terminaron como ${status}.`);
}

function login(email, password) {
  const session = new Session();
  return session.post("/api/auth/login", { email, password }).then((response) => {
    must(`login ficticio ${email}`, response, 200);
    return session;
  });
}

async function createExpediente(manager, sample, responsableId) {
  const result = must("crear expediente ficticio", await manager.post("/api/expedientes", {
    clienteId: sample.cliente_id,
    tramite: "interconexion_fv_mt",
    nivelTension: "MT",
    habilitado: true,
    responsableId,
  }), 201);
  return result.expediente;
}

function pdf(name) {
  return new Blob([`%PDF-1.4\n% ${name}\n%%EOF\n`], { type: "application/pdf" });
}

function form(fields, filename) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("file", pdf(filename), filename);
  return data;
}

async function uploadR06(client, expedienteId) {
  return must("cargar documento ficticio R06", await client.post(`/api/expedientes/${expedienteId}/documents`, form({
    requirementCode: "R06",
  }, "R06_SIMULATOR_FIXTURE.pdf")), 201);
}

function nextZohoId() {
  const value = state.nextId.toString();
  state.nextId++;
  return value;
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function pauseNextProjectRequest() {
  let markStarted;
  let release;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  state.pausedProjectRequest = { markStarted, released };
  return { started, release };
}

function snapshotTaskDescription(snapshot, task) {
  const subtasks = task.subtasks.map((item) => `${item.label}: ${item.status}${item.date ? ` (${item.date})` : ""}`).join("\n");
  return [
    `Folio: ${snapshot.folio}`,
    `Estado: ${task.status}`,
    `Responsable: ${task.responsible}`,
    task.openedAt ? `Registro: ${task.openedAt}` : "",
    task.closedAt ? `Cierre: ${task.closedAt}` : "",
    subtasks,
  ].filter(Boolean).join("\n");
}

function simulatorMatchesSnapshot(folio, snapshot) {
  const tasks = [...state.tasks.values()].filter((task) => task.folio === folio);
  return tasks.length === 8 && snapshot.tasks.every((task) => {
    const actual = tasks.find((item) => item.name === `${folio} - ${task.label}`);
    const percent = task.status === "Cerrado" ? "100" : task.status === "Pendiente" ? "0" : "50";
    return actual?.percentComplete === percent && actual.description === snapshotTaskDescription(snapshot, task);
  });
}

function createSimulator() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", simulatorBase);
    if (request.method === "POST" && url.pathname === "/oauth/v2/token") {
      state.tokenCalls++;
      state.currentToken = `tok-ficticio-a4-${state.tokenCalls}`;
      sendJson(response, 200, { access_token: state.currentToken, expires_in: 3600 });
      return;
    }
    const taskMatch = url.pathname.match(/\/tasks(?:\/([^/]+))?\/?$/);
    if (request.method !== "POST" || !taskMatch) {
      sendJson(response, 404, { error: "simulator_route_not_found" });
      return;
    }
    if (state.pausedProjectRequest) {
      const gate = state.pausedProjectRequest;
      state.pausedProjectRequest = null;
      gate.markStarted();
      await gate.released;
    }
    if (state.reject401Once) {
      state.reject401Once = false;
      sendJson(response, 401, { error: "unauthorized_once" });
      return;
    }
    if (request.headers.authorization !== `Bearer ${state.currentToken}`) {
      sendJson(response, 401, { error: "unauthorized" });
      return;
    }
    if (state.reject429Once) {
      state.reject429Once = false;
      sendJson(response, 429, { error: "rate_limited_once" });
      return;
    }

    let content = "";
    for await (const chunk of request) content += chunk;
    const fields = new URLSearchParams(content);
    const name = fields.get("name") ?? "";
    const folio = name.split(" - Gate ")[0] ?? "";
    const taskId = taskMatch[1] ? decodeURIComponent(taskMatch[1]) : null;
    if (taskId) {
      const existing = state.tasks.get(taskId);
      if (!existing) {
        sendJson(response, 404, { error: "task_not_found" });
        return;
      }
      const task = { id: taskId, folio, name, description: fields.get("description"), percentComplete: fields.get("percent_complete") };
      state.tasks.set(taskId, task);
      state.requests.push({ kind: "update", taskId, folio, name });
      sendJson(response, 200, { tasks: [{ id: Number(taskId), id_string: taskId }] });
      return;
    }

    if (state.failAfterCreates && state.failAfterCreates.created >= state.failAfterCreates.limit) {
      state.failAfterCreates = null;
      sendJson(response, 429, { error: "rate_limited_after_partial_create" });
      return;
    }
    const id = nextZohoId();
    state.tasks.set(id, { id, folio, name, description: fields.get("description"), percentComplete: fields.get("percent_complete") });
    state.requests.push({ kind: "create", taskId: id, folio, name });
    if (state.failAfterCreates) state.failAfterCreates.created++;
    const responseMode = state.nextCreationResponse;
    state.nextCreationResponse = null;
    if (responseMode === "unsafe-number") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(`{"tasks":[{"id":${id}}]}`);
    } else if (responseMode === "string-id") {
      sendJson(response, 200, { tasks: [{ id }] });
    } else if (responseMode === "safe-number") {
      sendJson(response, 200, { tasks: [{ id: 275056900000000 }] });
      state.tasks.delete(id);
      state.tasks.set("275056900000000", { id: "275056900000000", folio, name, description: fields.get("description"), percentComplete: fields.get("percent_complete") });
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(`{"tasks":[{"id":${id},"id_string":"${id}"}]}`);
    }
  });
}

let admin;
try {
  simulator = createSimulator();
  await new Promise((resolve, reject) => {
    simulator.once("error", reject);
    simulator.listen(0, "127.0.0.1", resolve);
  });
  simulatorBase = `http://127.0.0.1:${simulator.address().port}`;

  const env = {
    ...process.env,
    APP_MODE: "local",
    NEXT_PUBLIC_MODO: "local",
    LOCAL_DATA_DIR: dataDir,
    MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    EMAIL_TRANSPORT: "file",
    ZOHO_TRANSPORT: "api",
    ZOHO_CLIENT_ID: "simulator-client-id",
    ZOHO_CLIENT_SECRET: "simulator-only-secret",
    ZOHO_REFRESH_TOKEN: "simulator-refresh-token",
    ZOHO_PORTAL_ID: "simulator-portal",
    ZOHO_PROJECT_ID: "simulator-project",
    ZOHO_DC: "com",
    ZOHO_ACCOUNTS_URL: simulatorBase,
    ZOHO_PROJECTS_API_URL: simulatorBase,
  };
  if (new URL(env.ZOHO_ACCOUNTS_URL).hostname !== "127.0.0.1" ||
      new URL(env.ZOHO_PROJECTS_API_URL).hostname !== "127.0.0.1") {
    throw new Error("Las URLs de pruebas deben apuntar únicamente al simulador local.");
  }
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "ignore" });
  const seeded = JSON.parse(execFileSync(process.execPath, [tsx, "scripts/db-seed.ts"], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(appPort)], { cwd: root, env, stdio: "ignore" });
  await waitFor(async () => (await fetch(`${base}/api/health`).then((response) => response.ok).catch(() => false)), "No inició el servidor aislado del simulador Zoho.");
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  ok("servidor del simulador A4 usa schemaVersion 12", health.schemaVersion === 12);

  const client = await login("cliente.demo@example.invalid", seeded.password);
  const manager = await login("coordinador.demo@example.invalid", seeded.password);
  const list = must("consultar expedientes ficticios", await manager.get("/api/expedientes"), 200);
  const sample = list.expedientes[0];
  const responsible = list.options.responsables.find((item) => item.email === "coordinador.demo@example.invalid");
  if (!sample || !responsible) throw new Error("Faltan datos ficticios para crear el expediente.");

  const primary = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(primary.id, "enviado");
  const firstRows = rowsForExpediente(primary.id);
  const firstIds = JSON.parse(firstRows[0].zoho_id).gates;
  const exactIdValues = Object.values(firstIds);
  const firstCreations = state.requests.filter((item) => item.kind === "create" && item.folio === primary.folio);
  ok("id_string conserva exactamente los ocho IDs de 19 dígitos", exactIdValues.length === 8 &&
    new Set(exactIdValues).size === 8 && firstIds["1"].endsWith("003") &&
    exactIdValues.every((id) => /^\d{19}$/.test(id) && firstCreations.some((created) => created.taskId === id)) &&
    exactIdValues.every((id) => state.tasks.has(id)) && firstCreations.length === 8);

  const requestsBeforeUpdate = state.requests.length;
  await uploadR06(client, primary.id);
  await waitForExpediente(primary.id, "enviado");
  const updateRequests = state.requests.slice(requestsBeforeUpdate).filter((item) => item.kind === "update" && item.folio === primary.folio);
  const secondRows = rowsForExpediente(primary.id);
  ok("el segundo envío actualiza solo Gate 2 con el ID exacto", updateRequests.length === 1 &&
    updateRequests[0].taskId === firstIds["2"] &&
    state.requests.filter((item) => item.kind === "create" && item.folio === primary.folio).length === 8 &&
    JSON.parse(secondRows.at(-1).zoho_id).gates["1"] === firstIds["1"]);

  admin = await login("seguridad.demo@example.invalid", seeded.password);
  const setup = must("iniciar MFA admin ficticio", await admin.post("/api/auth/mfa", { action: "begin" }), 200);
  must("confirmar MFA admin ficticio", await admin.post("/api/auth/mfa", { action: "confirm", code: totp(setup.secret) }), 200);

  state.failAfterCreates = { limit: 3, created: 0 };
  const partialFailure = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(partialFailure.id, "fallido");
  const partialRows = rowsForExpediente(partialFailure.id);
  const partialA = partialRows[0];
  const partialIds = JSON.parse(partialA.zoho_id).gates;
  ok("A4d: A queda fallido tras crear solo los Gates 1–3", partialIds["1"] && partialIds["2"] && partialIds["3"] &&
    !partialIds["4"] && Object.keys(partialIds).length === 3);

  await uploadR06(client, partialFailure.id);
  await waitFor(() => rowsForExpediente(partialFailure.id).at(-1)?.status === "enviado", "El envío B de A4d no terminó.");
  const partialB = rowsForExpediente(partialFailure.id).at(-1);
  const partialSnapshotB = JSON.parse(partialB.payload_json);
  const partialRequestsBeforeRetry = state.requests.length;
  must("A4d: Reintentar A después de enviar B", await admin.post("/api/admin/integraciones", { id: partialA.id }), 200);
  const partialAfterRetry = rowsForExpediente(partialFailure.id);
  const partialAfterA = partialAfterRetry.find((row) => row.id === partialA.id);
  const partialAfterB = partialAfterRetry.find((row) => row.id === partialB.id);
  ok("A4d: reintentar A no hace llamadas ni crea duplicados y conserva el estado de B", state.requests.length === partialRequestsBeforeRetry &&
    simulatorMatchesSnapshot(partialFailure.folio, partialSnapshotB) &&
    partialAfterA.status === "enviado" && consolidatedInto(partialAfterA) === partialB.id &&
    partialAfterB.status === "enviado" && !consolidatedInto(partialAfterB));

  state.reject429Once = true;
  const noIdFailure = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(noIdFailure.id, "fallido");
  const noIdA = rowsForExpediente(noIdFailure.id)[0];
  ok("A4d: A puede fallar sin haber guardado IDs", noIdA.zoho_id === null);
  await uploadR06(client, noIdFailure.id);
  await waitFor(() => rowsForExpediente(noIdFailure.id).at(-1)?.status === "enviado", "El envío B sin IDs previos no terminó.");
  const noIdB = rowsForExpediente(noIdFailure.id).at(-1);
  const noIdRequestsBeforeRetry = state.requests.length;
  must("A4d: Reintentar A sin IDs después de enviar B", await admin.post("/api/admin/integraciones", { id: noIdA.id }), 200);
  const noIdAfterRetry = rowsForExpediente(noIdFailure.id);
  const noIdAfterA = noIdAfterRetry.find((row) => row.id === noIdA.id);
  ok("A4d: A sin IDs no manda su snapshot viejo", state.requests.length === noIdRequestsBeforeRetry &&
    simulatorMatchesSnapshot(noIdFailure.folio, JSON.parse(noIdB.payload_json)) &&
    noIdAfterA.status === "enviado" && consolidatedInto(noIdAfterA) === noIdB.id);

  const baselineRows = rowsForExpediente(primary.id);
  const baselineSnapshot = JSON.parse(baselineRows.at(-1).payload_json);
  const baselineIds = JSON.parse(baselineRows.at(-1).zoho_id);
  const failedChoiceSnapshot = structuredClone(baselineSnapshot);
  failedChoiceSnapshot.eventType = "requisito_validado";
  const newestChoiceSnapshot = structuredClone(baselineSnapshot);
  newestChoiceSnapshot.eventType = "requisito_validado";
  newestChoiceSnapshot.tasks[1].responsible = "Responsable A4d ficticio";
  const failedChoiceCreatedAt = new Date(Date.now() + 1_000).toISOString();
  const newestChoiceCreatedAt = new Date(Date.now() + 2_000).toISOString();
  const failedChoiceA = insertOutboxRow(primary.id, "requisito_validado", failedChoiceSnapshot, "fallido",
    JSON.stringify(baselineIds), failedChoiceCreatedAt);
  const newestChoiceB = insertOutboxRow(primary.id, "requisito_validado", newestChoiceSnapshot, "pendiente",
    null, newestChoiceCreatedAt);
  state.reject429Once = true;
  const callsBeforeChoiceFailure = state.requests.length;
  must("A4d: reintentar A procesa la fila B más nueva", await admin.post("/api/admin/integraciones", { id: failedChoiceA }), 200);
  const afterChoiceFailure = rowsForExpediente(primary.id);
  const choiceAAfterFailure = afterChoiceFailure.find((row) => row.id === failedChoiceA);
  const choiceBAfterFailure = afterChoiceFailure.find((row) => row.id === newestChoiceB);
  ok("A4d: si B falla con 429, A no se marca enviado ni consolidado", state.requests.length === callsBeforeChoiceFailure &&
    choiceAAfterFailure.status === "pendiente" && !consolidatedInto(choiceAAfterFailure) &&
    choiceBAfterFailure.status === "fallido");
  const createsBeforeChoiceRetry = state.requests.filter((item) => item.kind === "create" && item.folio === primary.folio).length;
  must("A4d: Reintentar B completa el snapshot más nuevo", await admin.post("/api/admin/integraciones", { id: newestChoiceB }), 200);
  const afterChoiceRetry = rowsForExpediente(primary.id);
  const choiceAAfterRetry = afterChoiceRetry.find((row) => row.id === failedChoiceA);
  const choiceBAfterRetry = afterChoiceRetry.find((row) => row.id === newestChoiceB);
  ok("A4d: al recuperarse B, A se consolida y no se duplican tareas", choiceAAfterRetry.status === "enviado" &&
    consolidatedInto(choiceAAfterRetry) === newestChoiceB && choiceBAfterRetry.status === "enviado" &&
    state.requests.filter((item) => item.kind === "create" && item.folio === primary.folio).length === createsBeforeChoiceRetry &&
    simulatorMatchesSnapshot(primary.folio, newestChoiceSnapshot));

  const burst = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(burst.id, "enviado");
  const tokenCallsBeforeBurst = state.tokenCalls;
  const heldRequest = pauseNextProjectRequest();
  await uploadR06(client, burst.id);
  await heldRequest.started;
  let validationResponses;
  try {
    validationResponses = await Promise.all(Array.from({ length: 11 }, () =>
      manager.post(`/api/expedientes/${burst.id}/requirements/R06`, { action: "validate" })));
  } finally {
    heldRequest.release();
  }
  ok("la ráfaga de 11 validaciones se acepta", validationResponses.every((response) => response.status === 200));
  await waitForExpediente(burst.id, "enviado");
  const burstRows = rowsForExpediente(burst.id);
  const burstSnapshot = JSON.parse(burstRows.at(-1).payload_json);
  const burstTasks = [...state.tasks.values()].filter((task) => task.folio === burst.folio);
  const burstCreates = state.requests.filter((item) => item.kind === "create" && item.folio === burst.folio);
  ok("la ráfaga crea exactamente 8 tareas y no pide más de un token", burstCreates.length === 8 &&
    state.tokenCalls - tokenCallsBeforeBurst <= 1,
  JSON.stringify({ creates: burstCreates.length, tokens: state.tokenCalls - tokenCallsBeforeBurst }));
  ok("Zoho conserva el estado exacto del snapshot final de la ráfaga", burstTasks.length === 8 &&
    burstSnapshot.tasks.every((task) => {
      const actual = burstTasks.find((item) => item.name === `${burst.folio} - ${task.label}`);
      const percent = task.status === "Cerrado" ? "100" : task.status === "Pendiente" ? "0" : "50";
      return actual?.percentComplete === percent && actual.description === snapshotTaskDescription(burstSnapshot, task);
    }));

  const validations = burstRows.filter((row) => row.event_type === "requisito_validado");
  const consolidatedRows = validations.filter((row) => {
    try { return Boolean(JSON.parse(row.zoho_id).consolidadoEn); } catch { return false; }
  });
  const dashboard = must("consultar consolidaciones de Zoho", await admin.get("/api/admin/integraciones"), 200);
  const consolidatedEntry = dashboard.entries.find((entry) => entry.id === consolidatedRows[0]?.id);
  const integrationsPage = await admin.get("/admin/integraciones");
  ok("los envíos consolidados son visibles en Integraciones", validations.length === 11 && consolidatedRows.length > 0 &&
    consolidatedRows.every((row) => row.status === "enviado" && row.last_error === null) &&
    Boolean(consolidatedEntry?.consolidatedAt) && integrationsPage.status === 200 &&
    integrationsPage.text.includes("Consolidado en el envío de las"));

  const beforeSingleUpdate = state.requests.length;
  await manager.post(`/api/expedientes/${burst.id}/requirements/R06`, { action: "validate" });
  await waitForExpediente(burst.id, "enviado");
  const singleUpdates = state.requests.slice(beforeSingleUpdate).filter((item) => item.kind === "update" && item.folio === burst.folio);
  ok("un evento que solo cambia Gate 2 produce como máximo una actualización", singleUpdates.length <= 1 &&
    singleUpdates.every((item) => item.name.endsWith("Gate 2")));

  const before401Tokens = state.tokenCalls;
  state.reject401Once = true;
  await manager.post(`/api/expedientes/${burst.id}/requirements/R06`, { action: "validate" });
  await waitForExpediente(burst.id, "enviado");
  ok("HTTP 401 renueva el token una vez y completa el envío", state.tokenCalls === before401Tokens + 1 &&
    rowsForExpediente(burst.id).at(-1).status === "enviado");

  state.reject429Once = true;
  await manager.post(`/api/expedientes/${burst.id}/requirements/R06`, { action: "validate" });
  await waitFor(() => rowsForExpediente(burst.id).at(-1)?.status === "fallido", "El envío con límite 429 no quedó fallido.");
  const rateLimitedRow = rowsForExpediente(burst.id).at(-1);
  ok("HTTP 429 deja un error claro y permite Reintentar", rateLimitedRow.last_error === "Zoho limitó las peticiones; usa Reintentar en unos minutos.");
  const createsBeforeRetry = state.requests.filter((item) => item.kind === "create" && item.folio === burst.folio).length;
  must("Reintentar recupera el 429", await admin.post("/api/admin/integraciones", { id: rateLimitedRow.id }), 200);
  await waitForExpediente(burst.id, "enviado");
  ok("Reintentar tras 429 no duplica tareas", state.requests.filter((item) => item.kind === "create" && item.folio === burst.folio).length === createsBeforeRetry &&
    rowsForExpediente(burst.id).at(-1).status === "enviado");

  const staleRow = rowsForExpediente(burst.id).at(-1);
  const oldAttempt = new Date(Date.now() - 3 * 60_000).toISOString();
  updateOutboxRow(staleRow.id, "enviando", oldAttempt);
  const staleSendingDashboard = must("consultar envío atascado", await admin.get("/api/admin/integraciones"), 200);
  ok("Integraciones habilita Reintentar para un envío atascado", staleSendingDashboard.entries.find((entry) => entry.id === staleRow.id)?.retryable === true);
  const attemptsBeforeStaleRetry = staleRow.attempts;
  must("Reintentar acepta un envío atascado", await admin.post("/api/admin/integraciones", { id: staleRow.id }), 200);
  ok("el envío atascado termina enviado", rowsForExpediente(burst.id).at(-1).status === "enviado" &&
    rowsForExpediente(burst.id).at(-1).attempts === attemptsBeforeStaleRetry + 1);

  const stalePendingExpediente = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(stalePendingExpediente.id, "enviado");
  const stalePendingRow = rowsForExpediente(stalePendingExpediente.id).at(-1);
  const oldCreatedAt = new Date(Date.now() - 2 * 60_000).toISOString();
  updateOutboxRow(stalePendingRow.id, "pendiente", null, oldCreatedAt);
  const stalePendingDashboard = must("consultar envío pendiente antiguo", await admin.get("/api/admin/integraciones"), 200);
  ok("Integraciones habilita Reintentar para un pendiente de más de un minuto", stalePendingDashboard.entries.find((entry) => entry.id === stalePendingRow.id)?.retryable === true);
  const attemptsBeforePendingRetry = stalePendingRow.attempts;
  must("Reintentar acepta un pendiente antiguo", await admin.post("/api/admin/integraciones", { id: stalePendingRow.id }), 200);
  const retriedPendingRow = rowsForExpediente(stalePendingExpediente.id).find((row) => row.id === stalePendingRow.id);
  ok("el pendiente antiguo termina enviado", retriedPendingRow.status === "enviado" && retriedPendingRow.attempts === attemptsBeforePendingRetry + 1);

  state.nextCreationResponse = "unsafe-number";
  const invalidIdExpediente = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(invalidIdExpediente.id, "fallido");
  const failedRow = rowsForExpediente(invalidIdExpediente.id)[0];
  ok("ID numérico inseguro sin id_string deja el envío fallido con error claro", failedRow.last_error === "Zoho Projects no devolvió el identificador de una tarea.");

  const retried = must("Reintentar recupera el envío con id_string", await admin.post("/api/admin/integraciones", { id: failedRow.id }), 200);
  await waitForExpediente(invalidIdExpediente.id, "enviado");
  ok("Reintentar completa la entrega y conserva IDs exactos", retried.status === "enviado" &&
    Object.values(JSON.parse(rowsForExpediente(invalidIdExpediente.id).at(-1).zoho_id).gates).every((id) => /^\d{19}$/.test(id)));

  state.nextCreationResponse = "string-id";
  const stringIdExpediente = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(stringIdExpediente.id, "enviado");
  const stringIds = Object.values(JSON.parse(rowsForExpediente(stringIdExpediente.id)[0].zoho_id).gates);
  ok("el fallback acepta id como cadena de dígitos", stringIds.length === 8 && stringIds.every((id) => /^\d{19}$/.test(id)));

  state.nextCreationResponse = "safe-number";
  const safeNumberExpediente = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(safeNumberExpediente.id, "enviado");
  const safeIds = Object.values(JSON.parse(rowsForExpediente(safeNumberExpediente.id)[0].zoho_id).gates);
  ok("el fallback acepta id numérico solo cuando es entero seguro", safeIds.length === 8 && safeIds[0] === "275056900000000");
} catch (error) {
  fail++;
  failures.push("la suite completó sin errores inesperados");
  console.error("Error en supervisor-zoho-api:", error);
  process.exitCode = 1;
} finally {
  database?.close();
  if (server && !server.killed) server.kill();
  if (simulator?.listening) await new Promise((resolve) => simulator.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 300));
  try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (error) {
    console.error("No se pudieron eliminar los datos temporales del simulador:", error);
    process.exitCode = 1;
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
