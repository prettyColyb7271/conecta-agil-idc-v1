import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-migration-004-"));
const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
try {
  db.exec("PRAGMA foreign_keys = ON");
  for (const filename of ["001_inicial.sql", "002_catalogo_y_registro.sql", "003_contrasena_temporal.sql"]) {
    db.exec(fs.readFileSync(path.join(root, "lib", "db", "migrations", filename), "utf8"));
  }
  db.exec("CREATE TABLE schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
  for (const filename of ["001_inicial.sql", "002_catalogo_y_registro.sql", "003_contrasena_temporal.sql"]) {
    db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)").run(filename, "fixture", new Date().toISOString());
  }
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id,email,display_name,role,status,password_hash,created_at,updated_at) VALUES ('u','u@example.invalid','Fixture','coordinador_idc','activo','hash',?,?)").run(now, now);
  db.prepare("INSERT INTO users (id,email,display_name,role,status,password_hash,created_at,updated_at) VALUES ('c','c@example.invalid','Cliente','cliente','activo','hash',?,?)").run(now, now);
  db.prepare("INSERT INTO expedientes (id,folio,tramite,nivel_tension,habilitado,cliente_id,gestor_id,coordinador_id,status,data_json,created_at,updated_at) VALUES ('e','IDC-FIX-0001','interconexion_fv_mt','MT',1,'c','u','u','borrador','{}',?,?)").run(now, now);
  db.prepare("INSERT INTO requirement_catalog (code,group_code,name,source_ref,required,created_at) VALUES ('R01','R','Solicitud','fixture',1,?)").run(now);
  db.prepare("INSERT INTO expediente_requirements (id,expediente_id,requirement_code,updated_at) VALUES ('r','e','R01',?)").run(now);
  db.prepare("INSERT INTO documents (id,expediente_id,requirement_id,document_type,source,sensitivity,status,created_by,created_at,updated_at) VALUES ('d','e','r','R01','idc','normal','cargado','u',?,?)").run(now, now);
  db.prepare("INSERT INTO document_versions (id,document_id,version_number,storage_key,original_filename,mime_type,size_bytes,sha256,author_id,origin,created_at) VALUES ('v','d',1,'d/v.pdf','v.pdf','application/pdf',4,'hash','u','carga',?)").run(now);
  db.prepare("INSERT INTO observations (id,expediente_id,requirement_id,author_id,visibility,body,created_at) VALUES ('o','e','r','u','interno_idc','fixture',?)").run(now);
  db.close();
  const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
  execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/db-migrate.ts"], { cwd: root, env, stdio: "pipe" });
  const migrated = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const version = migrated.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE filename = '004_flujo_firma_privacidad.sql'").get().n;
  const observations = migrated.prepare("SELECT COUNT(*) AS n FROM observations").get().n;
  if (version !== 1 || observations !== 1) throw new Error("La migración 004 no conservó los datos referenciados.");
  migrated.close();
  console.log("Migración 004 con documentos y observaciones: ✅");
} finally {
  try { db.close(); } catch {}
  fs.rmSync(dataDir, { recursive: true, force: true });
}
