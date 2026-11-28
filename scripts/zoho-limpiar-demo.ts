import { loadEnvConfig } from "@next/env";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

type ZohoTask = { id: string; name: string };

const dataCenters: Record<string, string> = {
  com: "com",
  eu: "eu",
  in: "in",
  au: "com.au",
  jp: "jp",
  ca: "ca",
  sa: "sa",
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para limpiar el folio de demo.`);
  return value;
}

function numericTaskId(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function tasksFrom(value: unknown): ZohoTask[] {
  if (!value || typeof value !== "object") throw new Error("Zoho Projects devolvió una respuesta de tareas inválida.");
  const tasks = (value as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) throw new Error("Zoho Projects no devolvió una lista de tareas.");
  return tasks.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const task = item as { id?: unknown; id_string?: unknown; name?: unknown };
    const id = numericTaskId(task.id_string) ?? numericTaskId(task.id);
    return id && typeof task.name === "string" ? [{ id, name: task.name }] : [];
  });
}

async function getAccessToken(): Promise<string> {
  const domainKey = process.env.ZOHO_DC?.trim().toLowerCase() || "com";
  const domain = dataCenters[domainKey];
  if (!domain) throw new Error("ZOHO_DC debe ser com, eu, in, au, jp, ca o sa.");
  const accountsRoot = process.env.ZOHO_ACCOUNTS_URL?.trim().replace(/\/+$/, "") || `https://accounts.zoho.${domain}`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: required("ZOHO_CLIENT_ID"),
    client_secret: required("ZOHO_CLIENT_SECRET"),
    refresh_token: required("ZOHO_REFRESH_TOKEN"),
  });
  let response: Response;
  try {
    response = await fetch(`${accountsRoot}/oauth/v2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new Error("No se pudo conectar con OAuth de Zoho.");
  }
  if (!response.ok) throw new Error(`OAuth de Zoho rechazó la solicitud (HTTP ${response.status}).`);
  const result = await response.json() as { access_token?: unknown };
  if (typeof result.access_token !== "string" || !result.access_token) {
    throw new Error("OAuth de Zoho no devolvió un token de acceso.");
  }
  return result.access_token;
}

async function request(url: string, method: "GET" | "DELETE", token: string): Promise<Response> {
  try {
    return await fetch(url, { method, headers: { authorization: `Bearer ${token}` } });
  } catch {
    throw new Error("No se pudo conectar con Zoho Projects.");
  }
}

async function listTasks(root: string, folio: string, token: string): Promise<ZohoTask[]> {
  const selected: ZohoTask[] = [];
  const pageSize = 100;
  for (let index = 1; ; index += 1) {
    const url = new URL(`${root}/`);
    url.searchParams.set("index", String(index));
    url.searchParams.set("range", String(pageSize));
    const response = await request(url.toString(), "GET", token);
    if (response.status === 401) throw new Error("Zoho Projects rechazó el token de acceso.");
    if (!response.ok) throw new Error(`No se pudieron consultar las tareas (HTTP ${response.status}).`);
    const page = tasksFrom(await response.json());
    selected.push(...page.filter((task) => /^IDC-(?:DEMO|[0-9]{4})-[0-9]{4} - Gate [1-8]$/.test(task.name) &&
      task.name.startsWith(`${folio} - Gate `)));
    if (page.length < pageSize) return selected;
  }
}

async function confirmDeletion(tasks: ZohoTask[], folio: string): Promise<boolean> {
  console.log(`Se encontraron ${tasks.length} tareas exactas de ${folio}:`);
  for (const task of tasks) console.log(`- ${task.name}`);
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question("¿Borrar solo estas tareas? (s/N) ");
    return answer.trim().toLowerCase() === "s";
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((value) => value !== "--");
  if (args.length !== 1 || !/^IDC-(?:DEMO|[0-9]{4})-[0-9]{4}$/.test(args[0])) {
    throw new Error("Uso: npm run zoho:limpiar-demo -- <folio-demo>");
  }

  if (
    !process.env.ZOHO_TRANSPORT?.trim() ||
    !process.env.ZOHO_CLIENT_ID?.trim() ||
    !process.env.ZOHO_CLIENT_SECRET?.trim() ||
    !process.env.ZOHO_REFRESH_TOKEN?.trim()
  ) {
    loadEnvConfig(process.cwd());
  }
  if (process.env.ZOHO_TRANSPORT?.trim().toLowerCase() !== "api") {
    throw new Error("La limpieza requiere ZOHO_TRANSPORT=api.");
  }
  const portal = encodeURIComponent(required("ZOHO_PORTAL_ID"));
  const project = encodeURIComponent(required("ZOHO_PROJECT_ID"));
  const domainKey = process.env.ZOHO_DC?.trim().toLowerCase() || "com";
  const domain = dataCenters[domainKey];
  if (!domain) throw new Error("ZOHO_DC debe ser com, eu, in, au, jp, ca o sa.");
  const apiRoot = process.env.ZOHO_PROJECTS_API_URL?.trim().replace(/\/+$/, "") || `https://projectsapi.zoho.${domain}`;
  const projectRoot = `${apiRoot}/restapi/portal/${portal}/projects/${project}/tasks`;
  const token = await getAccessToken();
  const tasks = await listTasks(projectRoot, args[0], token);
  if (tasks.length === 0) {
    console.log("No hay tareas coincidentes; no se hizo ningún cambio.");
    return;
  }
  if (!await confirmDeletion(tasks, args[0])) {
    console.log("Cancelado; no se borró ninguna tarea.");
    return;
  }

  let deleted = 0;
  for (const task of tasks) {
    const response = await request(`${projectRoot}/${encodeURIComponent(task.id)}/`, "DELETE", token);
    if (response.status === 401) throw new Error("Zoho Projects rechazó el token durante la eliminación.");
    if (!response.ok) throw new Error(`No se pudo borrar ${task.name} (HTTP ${response.status}).`);
    deleted += 1;
  }
  console.log(`Tareas ficticias eliminadas: ${deleted}.`);
}

main().catch((error: unknown) => {
  console.error("No se pudo completar la limpieza de demo.", error);
  process.exitCode = 1;
});
