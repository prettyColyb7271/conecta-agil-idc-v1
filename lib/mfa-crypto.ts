import crypto from "node:crypto";

export type EncryptedMfaSecret = {
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
};

export function parseMfaEncryptionKey(raw: string | undefined, variableName: string): Buffer {
  const value = raw?.trim() ?? "";
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${variableName} debe representar exactamente 32 bytes.`);
  return key;
}

export function encryptMfaSecretWithKey(secret: string, key: Buffer): EncryptedMfaSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secret_ciphertext: ciphertext.toString("base64"),
    secret_iv: iv.toString("base64"),
    secret_auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptMfaSecretWithKey(row: EncryptedMfaSecret, key: Buffer): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.secret_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
