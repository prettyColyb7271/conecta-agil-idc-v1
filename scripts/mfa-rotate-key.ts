import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { DatabaseSync } from "node:sqlite";
import { getDatabasePath } from "@/lib/db/sqlite-runtime";
import { decryptMfaSecretWithKey, encryptMfaSecretWithKey, parseMfaEncryptionKey } from "@/lib/mfa-crypto";

type MfaRow = {
  user_id: string;
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
};

function rotateMfaSecrets(): number {
  loadEnvConfig(process.cwd());
  const previousKey = parseMfaEncryptionKey(process.env.MFA_ENCRYPTION_KEY_ANTERIOR, "MFA_ENCRYPTION_KEY_ANTERIOR");
  const nextKey = parseMfaEncryptionKey(process.env.MFA_ENCRYPTION_KEY, "MFA_ENCRYPTION_KEY");
  const databasePath = getDatabasePath();
  if (!fs.existsSync(databasePath)) throw new Error("No existe la base de datos configurada.");

  const backupDirectory = path.join(path.dirname(databasePath), "respaldos");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `antes-rotacion-mfa-${timestamp}.sqlite`);
  const database = new DatabaseSync(databasePath);

  try {
    database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    const update = database.prepare(`
      UPDATE user_mfa
      SET secret_ciphertext = ?, secret_iv = ?, secret_auth_tag = ?
      WHERE user_id = ?
    `);

    database.exec("BEGIN IMMEDIATE");
    let count = 0;
    try {
      const rows = database.prepare(`
        SELECT user_id, secret_ciphertext, secret_iv, secret_auth_tag
        FROM user_mfa ORDER BY user_id
      `).all() as MfaRow[];
      for (const row of rows) {
        const secret = decryptMfaSecretWithKey(row, previousKey);
        const encrypted = encryptMfaSecretWithKey(secret, nextKey);
        update.run(
          encrypted.secret_ciphertext,
          encrypted.secret_iv,
          encrypted.secret_auth_tag,
          row.user_id,
        );
      }
      count = rows.length;
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return count;
  } finally {
    database.close();
  }
}

try {
  console.log(`${rotateMfaSecrets()} secretos MFA re-cifrados`);
} catch (error) {
  const detail = error instanceof Error ? error.message : "error desconocido";
  console.error(`No se pudo completar la rotación MFA: ${detail}`);
  process.exitCode = 1;
}
