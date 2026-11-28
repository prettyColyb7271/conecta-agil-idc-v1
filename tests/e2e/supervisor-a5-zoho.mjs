import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const tasks = new Map([
  ["1001", { id_string: "1001", name: "IDC-DEMO-0001 - Gate 1" }],
  ["1002", { id_string: "1002", name: "IDC-DEMO-0001 - Gate 8" }],
  ["2001", { id_string: "2001", name: "IDC-DEMO-0002 - Gate 1" }],
  ["3001", { id_string: "3001", name: "IDC-DEMO-00010 - Gate 1" }],
  ["4001", { id_string: "4001", name: "IDC-DEMO-0001 - Gate 9" }],
]);
const secrets = ["A5_SIMULATOR_CLIENT_SECRET", "A5_SIMULATOR_REFRESH_TOKEN"];
let apiRequests = 0;
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, condition, detail = "") {
  if (condition) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    failures.push(name);
    console.log("  ❌", name, detail);
  }
}

function send(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function runCleaner(base, confirmation, folio = "IDC-DEMO-0001") {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      APP_MODE: "local",
      ZOHO_TRANSPORT: "api",
      ZOHO_CLIENT_ID: "A5_SIMULATOR_CLIENT_ID",
      ZOHO_CLIENT_SECRET: secrets[0],
      ZOHO_REFRESH_TOKEN: secrets[1],
      ZOHO_PORTAL_ID: "simulator-portal",
      ZOHO_PROJECT_ID: "simulator-project",
      ZOHO_DC: "com",
      ZOHO_ACCOUNTS_URL: base,
      ZOHO_PROJECTS_API_URL: base,
    };
    if (new URL(env.ZOHO_ACCOUNTS_URL).hostname !== "127.0.0.1" ||
      new URL(env.ZOHO_PROJECTS_API_URL).hostname !== "127.0.0.1") {
      reject(new Error("La suite A5 solo puede usar el simulador local."));
      return;
    }
    const child = spawn(process.execPath, [tsx, "scripts/zoho-limpiar-demo.ts", folio], {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill(), 20_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(confirmation);
  });
}

const simulator = http.createServer(async (request, response) => {
  apiRequests++;
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "POST" && url.pathname === "/oauth/v2/token") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const values = new URLSearchParams(body);
    if (values.get("client_secret") !== secrets[0] || values.get("refresh_token") !== secrets[1]) {
      send(response, 401, { error: "simulator_credentials_rejected" });
      return;
    }
    send(response, 200, { access_token: "A5_SIMULATOR_ACCESS_TOKEN", expires_in: 3600 });
    return;
  }
  const taskRoute = url.pathname.match(/^\/restapi\/portal\/simulator-portal\/projects\/simulator-project\/tasks\/?(?:\/(\d+)\/?)?$/);
  if (!taskRoute || request.headers.authorization !== "Bearer A5_SIMULATOR_ACCESS_TOKEN") {
    send(response, 404, { error: "simulator_route_not_found" });
    return;
  }
  if (request.method === "GET" && !taskRoute[1]) {
    send(response, 200, { tasks: [...tasks.values()] });
    return;
  }
  if (request.method === "DELETE" && taskRoute[1]) {
    const deleted = tasks.delete(taskRoute[1]);
    send(response, deleted ? 200 : 404, { deleted });
    return;
  }
  send(response, 405, { error: "simulator_method_not_allowed" });
});

try {
  await new Promise((resolve, reject) => {
    simulator.once("error", reject);
    simulator.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${simulator.address().port}`;
  const before = apiRequests;
  const cancelled = await runCleaner(base, "n\n");
  ok("la cancelación no borra ninguna tarea", cancelled.code === 0 && /Cancelado/.test(cancelled.stdout) &&
    tasks.size === 5, `${cancelled.code}: ${cancelled.stdout}${cancelled.stderr}`);
  ok("Zoho recibe solo solicitudes locales del simulador", apiRequests > before);

  const confirmed = await runCleaner(base, "s\n");
  const remainingNames = [...tasks.values()].map((task) => task.name);
  ok("la confirmación elimina solo las tareas Gate 1–8 del folio indicado",
    confirmed.code === 0 && /Tareas ficticias eliminadas: 2/.test(confirmed.stdout) &&
    !remainingNames.includes("IDC-DEMO-0001 - Gate 1") &&
    !remainingNames.includes("IDC-DEMO-0001 - Gate 8") &&
    remainingNames.includes("IDC-DEMO-0002 - Gate 1") &&
    remainingNames.includes("IDC-DEMO-00010 - Gate 1") &&
    remainingNames.includes("IDC-DEMO-0001 - Gate 9"),
  `${confirmed.code}: ${confirmed.stdout}${confirmed.stderr}; restantes=${remainingNames.join("|")}`);
  ok("las credenciales y el token del simulador no se imprimen",
    [...secrets, "A5_SIMULATOR_ACCESS_TOKEN", "A5_SIMULATOR_CLIENT_ID"]
      .every((secret) => !`${cancelled.stdout}${cancelled.stderr}${confirmed.stdout}${confirmed.stderr}`.includes(secret)));

  const invalid = await runCleaner(base, "s\n", "IDC-DEMO-00001");
  ok("un folio inválido se rechaza antes de contactar al simulador", invalid.code !== 0 &&
    apiRequests === before + 6, `${invalid.code}: requests=${apiRequests}; ${invalid.stderr}`);
} catch (error) {
  console.error("Falló la prueba del limpiador de Zoho A5.", error);
  fail++;
  failures.push("ejecución del simulador Zoho");
} finally {
  await new Promise((resolve) => simulator.close(resolve));
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(` - ${failures.join("\n - ")}`);
  if (fail) process.exitCode = 1;
}
