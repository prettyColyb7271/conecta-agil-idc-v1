import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "@/lib/db/sqlite-runtime";
import { seedDatabase } from "@/lib/db/seed";
import { assertSafeDemoDataDir } from "./demo-safety";

function main(): void {
  const dataDir = assertSafeDemoDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.readdirSync(dataDir).length > 0) {
    throw new Error("demo:seed solo acepta un LOCAL_DATA_DIR vacío.");
  }

  const result = seedDatabase();
  const database = getDatabase();
  const row = database.prepare("SELECT id, data_json FROM expedientes WHERE folio = ?").get("IDC-DEMO-0001") as
    { id: string; data_json: string } | undefined;
  if (!row) throw new Error("No se creó el expediente ficticio esperado.");
  const data = JSON.parse(row.data_json) as {
    solicitante?: { nombre_razon_social?: string; rfc?: string };
    central?: { capacidad_bruta_kw?: number };
  };
  data.solicitante = {
    ...data.solicitante,
    nombre_razon_social: "Empresa Solar Ficticia S.A. de C.V.",
    rfc: "XAXX010101000",
  };
  data.central = { ...data.central, capacidad_bruta_kw: 45.5 };
  database.prepare("UPDATE expedientes SET data_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(data), new Date().toISOString(), row.id);

  const managerCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'coordinador_idc'").get()?.count ?? 0);
  const adminCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin_seguridad'").get()?.count ?? 0);
  if (managerCount < 2 || adminCount < 1) throw new Error("La semilla necesita dos Gestores IDC y un admin.");
  if (!fs.existsSync(path.join(dataDir, "conecta-agil.sqlite"))) throw new Error("No se creó la base ficticia.");

  console.log(JSON.stringify({ ...result, gestores: managerCount, administradores: adminCount, folio: "IDC-DEMO-0001" }));
}

try {
  main();
} catch (error) {
  console.error("No se pudo crear la semilla ficticia.", error);
  process.exitCode = 1;
}
