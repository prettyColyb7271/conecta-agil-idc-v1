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
  nextId: 2750569000000118003n,
  nextCreationResponse: null,
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
      SELECT id, event_type, status, last_error, zoho_id, created_at
      FROM outbox WHERE expediente_id = ? ORDER BY created_at, rowid
    `).all(expedienteId);
  } finally {
    db.close();
  }
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

function createSimulator() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", simulatorBase);
    if (request.method === "POST" && url.pathname === "/oauth/v2/token") {
      state.tokenCalls++;
      sendJson(response, 200, { access_token: "tok-ficticio-a4", expires_in: 3600 });
      return;
    }
    const taskMatch = url.pathname.match(/\/tasks(?:\/([^/]+))?\/?$/);
    if (request.method !== "POST" || !taskMatch || request.headers.authorization !== "Bearer tok-ficticio-a4") {
      sendJson(response, 404, { error: "simulator_route_not_found" });
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

    const id = nextZohoId();
    state.tasks.set(id, { id, folio, name, description: fields.get("description"), percentComplete: fields.get("percent_complete") });
    state.requests.push({ kind: "create", taskId: id, folio, name });
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
  ok("servidor del simulador A4 usa schemaVersion 9", health.schemaVersion === 9);

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
  ok("el segundo envío actualiza usando el ID exacto y no crea tareas duplicadas", updateRequests.length === 8 &&
    updateRequests.every((item) => Object.values(firstIds).includes(item.taskId)) &&
    state.requests.filter((item) => item.kind === "create" && item.folio === primary.folio).length === 8 &&
    JSON.parse(secondRows.at(-1).zoho_id).gates["1"] === firstIds["1"]);

  state.nextCreationResponse = "unsafe-number";
  const invalidIdExpediente = await createExpediente(manager, sample, responsible.id);
  await waitForExpediente(invalidIdExpediente.id, "fallido");
  const failedRow = rowsForExpediente(invalidIdExpediente.id)[0];
  ok("ID numérico inseguro sin id_string deja el envío fallido con error claro", failedRow.last_error === "Zoho Projects no devolvió el identificador de una tarea.");

  admin = await login("seguridad.demo@example.invalid", seeded.password);
  const setup = must("iniciar MFA admin ficticio", await admin.post("/api/auth/mfa", { action: "begin" }), 200);
  must("confirmar MFA admin ficticio", await admin.post("/api/auth/mfa", { action: "confirm", code: totp(setup.secret) }), 200);
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
