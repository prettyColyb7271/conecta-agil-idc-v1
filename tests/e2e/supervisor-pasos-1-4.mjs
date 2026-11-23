// Supervisor E2E: Pasos 1–4 contra servidor local (no modifica código).
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const B = process.env.BASE ?? "http://localhost:3140";
const SEED = "ConectaLocal-2026!";
const ts = Date.now().toString().slice(-7);
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✅", name); } else { fail++; fails.push(name); console.log("  ❌", name, extra); } };

class S { // sesión con cookies
  jar = {};
  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const [k, v] = kv.split("="); if (v === "" || /Expires=Thu, 01 Jan 1970/i.test(c) || /Max-Age=0/i.test(c)) delete this.jar[k]; else this.jar[k] = v; } }
  async req(method, path, body, { origin = true, redirect = "manual", headers = {} } = {}) {
    const h = { ...headers }; if (this.cookie()) h.cookie = this.cookie(); if (origin) h.origin = B; if (body !== undefined) h["content-type"] = "application/json";
    const res = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)), redirect });
    this.store(res); const text = await res.text(); let json; try { json = JSON.parse(text); } catch {}
    return { status: res.status, loc: res.headers.get("location"), text, json, setCookie: res.headers.getSetCookie?.() ?? [] };
  }
  get(p, o) { return this.req("GET", p, undefined, o); } post(p, b, o) { return this.req("POST", p, b, o); } patch(p, b, o) { return this.req("PATCH", p, b, o); }
  async login(email, password = SEED) { return this.post("/api/auth/login", { email, password }); }
  async upload(path, code, bytes, name = "prueba.pdf", type = "application/pdf") {
    const form = new FormData(); form.set("requirementCode", code); form.set("file", new File([bytes], name, { type }));
    const h = { origin: B }; if (this.cookie()) h.cookie = this.cookie();
    const res = await fetch(B + path, { method: "POST", headers: h, body: form });
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json };
  }
}

const validData = (rfc = "XAXX010101000") => ({ solicitante: { tipo_persona: "moral", nombre_razon_social: "Ficticia Solar SA", rfc }, servicio_actual: { rpu: "123456789012", tarifa: "GDMTH" }, central: { tecnologia: "solar", capacidad_bruta_kw: 100 } });

console.log("== P1/P2 health y modo");
const anon = new S();
const h = await anon.get("/api/health");
ok("health local + sqlite + schemaVersion>=2", h.json?.modo === "local" && h.json?.db === "sqlite" && h.json?.schemaVersion >= 2, h.text);
ok("catálogo 28 requisitos", h.json?.counts?.requirement_catalog === 28);

console.log("== P3 guardas sin sesión");
for (const p of ["/portal", "/gestor", "/gestor/proyectos", "/gestor-cfe", "/admin", "/admin/usuarios"]) {
  const r = await anon.get(p); ok(`sin sesión ${p} → redirect`, [303, 307, 308].includes(r.status) && !/IDC-20|Mi expediente/.test(r.text), `${r.status}`);
}
for (const p of ["/api/expedientes", "/api/notifications", "/api/admin/users", "/api/coordinator/requests"]) {
  const r = await anon.get(p); ok(`sin sesión API ${p} → 401/403`, [401, 403].includes(r.status), `${r.status}`);
}
ok("POST sin Origin → 403", (await anon.post("/api/auth/login", { email: "x@x", password: "y" }, { origin: false })).status === 403);
ok("POST con Origin ajeno → 403", (await anon.post("/api/auth/login", { email: "x@x", password: "y" }, { origin: false, headers: { origin: "http://evil.example" } })).status === 403);

console.log("== P3 registro/aprobación");
const coord = new S(); const admin = new S();
ok("login coordinador", (await coord.login("coordinador.demo@example.invalid")).status === 200);
ok("login admin", (await admin.login("seguridad.demo@example.invalid")).status === 200);
const mkClient = async (tag) => {
  const s = new S(); const email = `e2e.${tag}.${ts}@example.invalid`; const pw = "E2e-Prueba-2026!";
  await s.post("/api/auth/register", { email, password: pw, displayName: `E2E ${tag}` });
  const reqs = (await coord.get("/api/coordinator/requests")).json?.requests ?? [];
  const r = reqs.find((x) => x.email === email);
  await coord.post("/api/coordinator/requests", { requestId: r?.id, action: "approve" });
  const l = await s.login(email, pw); return { s, email, pw, ok: l.status === 200, setCookie: l.setCookie };
};
const A = await mkClient("a"); const Bc = await mkClient("b");
ok("cliente A registrado+aprobado+login", A.ok); ok("cliente B registrado+aprobado+login", Bc.ok);
ok("cookies httpOnly y sin Secure en http", A.setCookie.length > 0 && A.setCookie.every((c) => /HttpOnly/i.test(c) && !/;\s*Secure/i.test(c)), A.setCookie.join(" | "));
const portalA0 = await A.s.get("/portal");
ok("/portal de cliente sin expediente renderiza sin error", portalA0.status === 200 && !/"digest"/.test(portalA0.text) && portalA0.text.includes("Aún no tienes"), portalA0.status);

console.log("== P4 alta de expediente");
const list0 = (await coord.get("/api/expedientes")).json;
const clientA = list0?.options?.clients?.find((c) => c.email === A.email);
const clientB = list0?.options?.clients?.find((c) => c.email === Bc.email);
const responsables = list0?.options?.responsables ?? [];
ok("opciones: clientes A/B y ≥1 Responsable IDC", clientA && clientB && responsables.length >= 1, JSON.stringify(responsables.map((g) => g.email)));
const g1 = responsables[0];
const cA = await coord.post("/api/expedientes", { clienteId: clientA?.id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: g1?.id });
const eA = cA.json?.expediente;
ok("alta A → 201 con folio IDC-AAAA-NNNN", cA.status === 201 && /^IDC-\d{4}-\d{4}$/.test(eA?.folio ?? ""), cA.text.slice(0, 200));
ok("alta A: 11 requisitos R, 8 gates, G0 abierto", eA?.requirements?.length === 11 && eA?.gates?.length === 8 && eA?.gates?.find((g) => g.gate_code === "G0")?.status === "abierto");
const cB = await coord.post("/api/expedientes", { clienteId: clientB?.id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true });
const eB = cB.json?.expediente;
const seq = (f) => Number(f?.split("-")[2]);
ok("folio secuencial (B = A+1)", seq(eB?.folio) === seq(eA?.folio) + 1, `${eA?.folio} ${eB?.folio}`);
ok("alta con cliente inexistente → 400", (await coord.post("/api/expedientes", { clienteId: "nope", tramite: "x", nivelTension: "MT", habilitado: true })).status === 400);
ok("alta con nivelTension inválido → 400", [400].includes((await coord.post("/api/expedientes", { clienteId: clientA?.id, tramite: "x", nivelTension: "AT", habilitado: true })).status));
ok("cliente no puede crear expediente → 403", (await A.s.post("/api/expedientes", { clienteId: clientA?.id, tramite: "x", nivelTension: "MT", habilitado: true })).status === 403);
ok("JSON malformado → 400 (no 500)", (await coord.req("POST", "/api/expedientes", "{malo")).status === 400);

console.log("== P4 aislamiento (IDOR)");
const la = (await A.s.get("/api/expedientes")).json?.expedientes ?? [];
ok("A solo ve sus expedientes", la.length >= 1 && la.every((e) => e.cliente_id === clientA?.id));
ok("A pide expediente de B → 404", (await A.s.get(`/api/expedientes/${eB?.id}`)).status === 404);
ok("A intenta editar expediente de B → 404", (await A.s.patch(`/api/expedientes/${eB?.id}`, { data: validData() })).status === 404);
const portalA = await A.s.get("/portal");
ok("A /portal muestra su folio sin error de render", portalA.text.includes(eA?.folio) && !/"digest"/.test(portalA.text));
const demoC = new S(); await demoC.login("cliente.demo@example.invalid");
const portalDemo = await demoC.get("/portal");
ok("cliente.demo /portal renderiza IDC-DEMO-0001 sin error", portalDemo.text.includes("IDC-DEMO-0001") && !/"digest"/.test(portalDemo.text));
for (const [email, path] of [["coordinador.demo@example.invalid", "/gestor"], ["coordinador.demo@example.invalid", "/gestor/proyectos"], ["seguridad.demo@example.invalid", "/admin/usuarios"]]) {
  const s = new S(); await s.login(email); const r = await s.get(path);
  ok(`${path} (${email.split(".")[0]}) 200 sin error y < 1 MB`, r.status === 200 && !/"digest"/.test(r.text) && r.text.length < 1_000_000, `${r.status} len=${r.text.length}`);
}
ok("admin GET /api/expedientes → 403", (await admin.get("/api/expedientes")).status === 403);
ok("admin GET /api/expedientes/:id → 403", (await admin.get(`/api/expedientes/${eA?.id}`)).status === 403);

console.log("== P4 Responsable IDC y reasignación");
const responsable1 = new S(); const responsable2 = new S();
ok("login Responsable IDC 1", (await responsable1.login(g1?.email)).status === 200);
const g2 = responsables[1];
ok("login Responsable IDC 2", !!g2 && (await responsable2.login(g2.email)).status === 200);
ok("Responsable IDC 1 ve expediente A", (await responsable1.get(`/api/expedientes/${eA?.id}`)).status === 200);
ok("Responsable IDC 2 ve expediente A por alcance IDC", !!g2 && (await responsable2.get(`/api/expedientes/${eA?.id}`)).status === 200);
ok("Responsable IDC no puede editar datos", (await responsable1.patch(`/api/expedientes/${eA?.id}`, { data: validData() })).status === 403);
ok("cliente no puede asignar Responsable IDC", (await A.s.patch(`/api/expedientes/${eA?.id}`, { action: "assign", responsableId: g1?.id })).status === 400);
ok("asignar cliente como Responsable IDC → 400", (await coord.patch(`/api/expedientes/${eA?.id}`, { action: "assign", responsableId: clientA?.id })).status === 400);
if (g2) {
  const ra = await coord.patch(`/api/expedientes/${eA?.id}`, { action: "assign", responsableId: g2.id });
  const hist = ra.json?.expediente?.assignments?.filter((a) => a.assignment_type === "coordinador_idc") ?? [];
  ok("reasignación → historial IDC con 2 responsables, anterior con ends_at", hist.length === 2 && hist.some((a) => a.ends_at) && hist.some((a) => !a.ends_at));
  ok("Responsable IDC anterior conserva acceso por alcance global", (await responsable1.get(`/api/expedientes/${eA?.id}`)).status === 200);
  const n1 = (await responsable1.get("/api/notifications")).json?.notifications ?? [];
  ok("Responsable IDC anterior recibe notificación", n1.some((n) => n.expediente_id === eA?.id && n.type === "expediente_reasignado"));
}

console.log("== P4 captura y validación");
const up = await A.s.patch(`/api/expedientes/${eA?.id}`, { data: validData() });
ok("captura válida → 200", up.status === 200, up.text.slice(0, 200));
const bad = async (name, d) => { const r = await A.s.patch(`/api/expedientes/${eA?.id}`, { data: d }); ok(`${name} → 400`, r.status === 400, `${r.status} ${r.text.slice(0, 120)}`); };
await bad("RFC inválido", validData("ABC"));
await bad("capacidad 0", { ...validData(), central: { capacidad_bruta_kw: 0 } });
await bad("RPU no numérico", { ...validData(), servicio_actual: { rpu: "12A" } });
await bad("falta RPU (RFC válido)", { ...validData(), servicio_actual: {} });
await bad("falta tipo_persona (RFC válido)", { ...validData(), solicitante: { nombre_razon_social: "X", rfc: "XAXX010101000" } });
const junk = await A.s.patch(`/api/expedientes/${eA?.id}`, { data: { ...validData(), campo_basura: "x".repeat(10), __proto__x: 1 } });
const after = JSON.parse((await A.s.get(`/api/expedientes/${eA?.id}`)).json?.expediente?.data_json ?? "{}");
ok("campos no permitidos → 400 y no se guardan", junk.status === 400 && !("campo_basura" in after), `${junk.status} ${junk.text.slice(0, 120)}`);
const big = await A.s.patch(`/api/expedientes/${eA?.id}`, { data: { ...validData(), solicitante: { ...validData().solicitante, nombre_razon_social: "x".repeat(2_000_000) } } });
ok("payload enorme (2 MB) rechazado", [400, 413].includes(big.status), big.status);
ok("JSON malformado en captura → 400", (await A.s.req("PATCH", `/api/expedientes/${eA?.id}`, "{malo")).status === 400);

console.log("== P4 notificaciones");
const nA = (await A.s.get("/api/notifications")).json?.notifications ?? [];
const nEx = nA.find((n) => n.expediente_id === eA?.id);
ok("cliente A notificado del alta", !!nEx);
ok("B no puede marcar notificación de A", (await Bc.s.patch("/api/notifications", { id: nEx?.id })).status === 200 && !((await A.s.get("/api/notifications")).json?.notifications.find((n) => n.id === nEx?.id)?.read_at));
await A.s.patch("/api/notifications", { id: nEx?.id });
ok("A marca su notificación como leída", !!(await A.s.get("/api/notifications")).json?.notifications.find((n) => n.id === nEx?.id)?.read_at);

console.log("== P5 documentos y revisión IDC");
const pdf = Buffer.from("%PDF-1.7\ncontenido ficticio E2E");
const expectedSha = crypto.createHash("sha256").update(pdf).digest("hex");
const upload = await A.s.upload(`/api/expedientes/${eA?.id}/documents`, "R01", pdf);
ok("PDF válido → 201 versión 1", upload.status === 201 && upload.json?.document?.versionNumber === 1);
ok("sha256 de carga correcto", upload.json?.document?.sha256 === expectedSha);
const exe = await A.s.upload(`/api/expedientes/${eA?.id}/documents`, "R01", Buffer.from("MZ-not-pdf"), "malware.pdf");
ok("EXE renombrado a PDF → 400", exe.status === 400);
const tooLarge = await A.s.upload(`/api/expedientes/${eA?.id}/documents`, "R01", new Uint8Array(20 * 1024 * 1024 + 1), "grande.pdf");
ok("archivo mayor de 20 MB → 413", tooLarge.status === 413);
const download = await A.s.get(`/api/documents/${upload.json?.document?.documentId}`);
const downloadedBytes = Buffer.from(await (await fetch(B + `/api/documents/${upload.json?.document?.documentId}`, { headers: { cookie: A.s.cookie() } })).arrayBuffer());
ok("descarga devuelve bytes y cabeceras seguras", download.status === 200 && crypto.createHash("sha256").update(downloadedBytes).digest("hex") === expectedSha);
const downloadResponse = await fetch(B + `/api/documents/${upload.json?.document?.documentId}`, { headers: { cookie: A.s.cookie() } });
ok("descarga attachment + nosniff", /attachment/i.test(downloadResponse.headers.get("content-disposition") ?? "") && downloadResponse.headers.get("x-content-type-options") === "nosniff");
ok("cliente B no descarga documento de A", (await Bc.s.get(`/api/documents/${upload.json?.document?.documentId}`)).status === 404);
ok("admin no descarga documentos", (await admin.get(`/api/documents/${upload.json?.document?.documentId}`)).status === 403);
const validated = await coord.post(`/api/expedientes/${eA?.id}/requirements/R01`, { action: "validate" });
ok("IDC valida requisito", validated.status === 200);
const internal = await coord.post(`/api/expedientes/${eA?.id}/requirements/R02`, { action: "observe", reason: "Corrección interna ficticia", visibility: "interno_idc" });
ok("observación interna creada", internal.status === 200);
const clientReview = await A.s.get(`/api/expedientes/${eA?.id}/requirements/R01`);
ok("cliente no ve observación interna", !(clientReview.json?.requirements ?? []).flatMap((r) => r.observations ?? []).some((o) => o.visibility === "interno_idc"));
const noReason = await coord.post(`/api/expedientes/${eA?.id}/requirements/R03`, { action: "observe" });
ok("observar sin motivo → 400", noReason.status === 400);
const second = await A.s.upload(`/api/expedientes/${eA?.id}/documents`, "R01", Buffer.from("%PDF-1.7\nsegunda versión"), "segunda.pdf");
const reviewAfterSecond = await coord.get(`/api/expedientes/${eA?.id}/requirements/R01`);
const r01 = reviewAfterSecond.json?.requirements?.find((r) => r.requirement_code === "R01");
ok("nueva versión invalida revisión previa y vuelve a cargado", second.status === 201 && r01?.status === "cargado" && r01?.versions?.length === 2 && r01.versions.some((v) => v.change_reason === "invalidado_por_cambio"));
const dbPath = process.env.LOCAL_DATA_DIR ? `${process.env.LOCAL_DATA_DIR}\\conecta-agil.sqlite` : null;
if (dbPath) {
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE gates SET status = 'cerrado' WHERE expediente_id = ? AND gate_code = 'G1'").run(eA?.id);
  db.close();
  const locked = await A.s.upload(`/api/expedientes/${eA?.id}/documents`, "R01", pdf, "bloqueado.pdf");
  ok("carga con G1 cerrado → 409", locked.status === 409);
}

console.log("== P3/P4 varios");
const oc = await anon.get("/api/auth/clear?next=//evil.example/x");
ok("/api/auth/clear no redirige a dominio externo", !(oc.loc ?? "").includes("evil.example"), oc.loc);
const oc2 = await anon.get("/api/auth/clear?next=/%5Cevil.example/x");
ok("/api/auth/clear rechaza ruta /\\ externa", oc2.loc === `${B}/`);
const blk = await admin.get("/api/admin/users"); const uA = blk.json?.users?.find((u) => u.email === A.email);
await admin.post("/api/admin/users", { userId: uA?.id, action: "block" });
ok("A bloqueado → API expedientes 401/403", [401, 403].includes((await A.s.get("/api/expedientes")).status));
await admin.post("/api/admin/users", { userId: uA?.id, action: "unblock" });
ok("A desbloqueado → API 200", (await A.s.get("/api/expedientes")).status === 200);
ok("logout A", (await A.s.post("/api/auth/logout", {})).status === 200);
ok("tras logout API → 401/403", [401, 403].includes((await A.s.get("/api/expedientes")).status));

console.log(`\nRESULTADO: ${pass} ✅  /  ${fail} ❌`); if (fails.length) console.log("Fallos:\n - " + fails.join("\n - "));
