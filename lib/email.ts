import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function fromAddress(transport: string): string {
  const value = process.env.EMAIL_FROM?.trim();
  if (!value && transport === "file") return "Conecta Agil <no-reply@example.invalid>";
  if (!value) throw new Error("EMAIL_FROM no está configurado.");
  return value;
}

async function sendToFile(message: EmailMessage): Promise<void> {
  const root = process.env.LOCAL_DATA_DIR?.trim() || path.join(process.cwd(), "local-data");
  const outbox = path.join(root, "outbox-email");
  await fs.mkdir(outbox, { recursive: true });
  const filename = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID()}.json`;
  await fs.writeFile(path.join(outbox, filename), JSON.stringify({
    from: fromAddress("file"),
    ...message,
    created_at: new Date().toISOString(),
  }, null, 2), "utf8");
}

async function sendToResend(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY no está configurada.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: fromAddress("resend"), to: [message.to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) throw new Error(`Resend rechazó el correo (HTTP ${response.status}).`);
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) throw new Error("Destinatario de correo inválido.");
  const transport = (process.env.EMAIL_TRANSPORT?.trim() || "file").toLowerCase();
  if (transport === "file") return sendToFile(message);
  if (transport === "resend") return sendToResend(message);
  throw new Error(`EMAIL_TRANSPORT no soportado: ${transport}`);
}
