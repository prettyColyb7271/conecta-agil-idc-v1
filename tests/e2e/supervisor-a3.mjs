import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = 3204;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a3-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let pass = 0;
let fail = 0;
const failures = [];
const ok = (name, condition, detail = "") => {
  if (condition) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
};

class Session {
  cookies = {};
  async request(method, route, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    if (body !== undefined) { headers.origin = base; headers["content-type"] = "application/json"; }
    const response = await fetch(`${base}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
    return { status: response.status, text: await response.text() };
  }
  get(route) { return this.request("GET", route); }
  post(route, body) { return this.request("POST", route, body); }
}

let server;
let database;
try {
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "ignore" });
  execFileSync(process.execPath, [tsx, "scripts/db-seed.ts"], { cwd: root, env, stdio: "ignore" });

  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const expediente = database.prepare("SELECT id, cliente_id, gestor_id FROM expedientes ORDER BY created_at DESC LIMIT 1").get();
  if (!expediente) throw new Error("No se encontró el expediente ficticio.");
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 5);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO external_events (
      id, expediente_id, event_type, event_date, description, document_id,
      created_by, created_at, vigencia_meses, vence_at, resultado, metadata_json
    ) VALUES (?, ?, 'resolucion_cfe', ?, 'Oficio ficticio', NULL, ?, ?, 2, ?, 'favorable', '{}')
  `).run(crypto.randomUUID(), expediente.id, now, expediente.gestor_id, now, expires.toISOString());
  database.close();
  database = null;

  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("No inició el servidor aislado de A3.");

  const gestor = new Session();
  const cliente = new Session();
  for (const [session, email] of [[gestor, "coordinador.demo@example.invalid"], [cliente, "cliente.demo@example.invalid"]]) {
    const login = await session.post("/api/auth/login", { email, password: "ConectaLocal-2026!" });
    if (login.status !== 200) throw new Error(`No inició sesión ficticia (${email}): ${login.status} ${login.text.slice(0, 120)}`);
  }

  const endpoint = `/api/expedientes/${expediente.id}`;
  const managerPage = await gestor.get("/gestor");
  const projectsPage = await gestor.get("/gestor/proyectos");
  const clientPage = await cliente.get("/portal");
  const visiblePageHtml = (page) => page.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const visibleGateCode = /\bG[0-7]\b/;
  ok("la interfaz no muestra códigos G0–G7 sin traducir", [managerPage, projectsPage, clientPage]
    .every((page) => page.status === 200 && !visibleGateCode.test(visiblePageHtml(page))));
  const fechaLimite = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(expires);
  const redBanner = (html) => html.includes("vence en 5 días") &&
    /role="alert" class="[^"]*border-red-500 bg-red-50 text-red-900/.test(html);
  ok("banner rojo de oficio a 5 días para Gestor IDC", redBanner(managerPage.text));
  ok("banner rojo de oficio a 5 días para cliente", redBanner(clientPage.text));
  ok("el Gestor ve oficio CFE y fecha en dd/mm/aaaa", managerPage.text.includes(`Oficio CFE vence en 5 días · ${fechaLimite}`));
  ok("el cliente ve el contexto del contrato y fecha en dd/mm/aaaa", clientPage.text.includes(`El oficio resolutivo de CFE vence en 5 días (${fechaLimite}). Antes de esa fecha hay que firmar el contrato.`));
  ok("el portal local no presenta las metas ilustrativas del anteproyecto", !clientPage.text.includes("90%") && !/\b4\.5\b/.test(clientPage.text));
  ok("el tablero local muestra indicadores reales, no la línea base ilustrativa", managerPage.text.includes("Indicadores del reto (datos reales)") &&
    managerPage.text.includes("Expedientes por Gate") && !managerPage.text.includes("Semanas a energización"));
  ok("los tiempos sin acuse ni alta muestran que aún no hay datos", managerPage.text.includes("Aún no hay datos"));
  const gateRows = await gestor.get(`${endpoint}/gates`);
  const gates = JSON.parse(gateRows.text).gates;
  ok("gateRows marca rojo el oficio que vence en cinco días", gates.find((gate) => gate.gate_code === "G4")?.alert?.level === "roja" &&
    gates.find((gate) => gate.gate_code === "G4")?.alert?.days === 5);

  const detail = await gestor.get(endpoint);
  ok("GET del detalle del expediente autorizado", detail.status === 200);
  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const log = database.prepare(`
    SELECT actor_id, actor_role, metadata_json FROM audit_events
    WHERE event_type = 'consulta_detalle_expediente' AND entity_id = ? AND actor_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(expediente.id, expediente.gestor_id);
  ok("la consulta del detalle queda en auditoría sin contenido", Boolean(log) && log.actor_role === "coordinador_idc" && log.metadata_json === "{}");
  const clientLog = database.prepare(`
    SELECT actor_role, metadata_json FROM audit_events
    WHERE event_type = 'consulta_detalle_expediente' AND entity_id = ? AND actor_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(expediente.id, expediente.cliente_id);
  ok("abrir el portal del cliente también registra la consulta sin contenido", Boolean(clientLog) &&
    clientLog.actor_role === "cliente" && clientLog.metadata_json === "{}");

  database.prepare("UPDATE gates SET status = 'cerrado' WHERE expediente_id = ? AND gate_code = 'G5'").run(expediente.id);
  database.close();
  database = null;
  const closedGateManagerPage = await gestor.get("/gestor");
  const closedGateClientPage = await cliente.get("/portal");
  ok("el banner desaparece al cerrar Gate 6", !closedGateManagerPage.text.includes("Oficio CFE vence en 5 días") &&
    !closedGateClientPage.text.includes("El oficio resolutivo de CFE vence en 5 días"));
} finally {
  database?.close();
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
