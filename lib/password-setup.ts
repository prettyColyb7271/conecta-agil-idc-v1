import crypto from "node:crypto";
import { getDatabase } from "@/lib/db/sqlite-runtime";

export const PASSWORD_SETUP_TOKEN_HOURS = 24;
export const DEMO_SEED_PASSWORD = "ConectaLocal-2026!";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPasswordSetupToken(userId: string, createdBy: string, validityHours: 24 | 72 = PASSWORD_SETUP_TOKEN_HOURS): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + validityHours * 60 * 60 * 1000).toISOString();
  const database = getDatabase();
  database.prepare("UPDATE password_setup_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(now.toISOString(), userId);
  database.prepare(
    "INSERT INTO password_setup_tokens (id, user_id, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(crypto.randomUUID(), userId, hashToken(token), expiresAt, createdBy, now.toISOString());
  return { token, expiresAt };
}
