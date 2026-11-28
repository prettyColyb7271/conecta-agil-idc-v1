import { isIP } from "node:net";

export function maskEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/^[^@]{1,2}\*{3}@[^@]+$/.test(email)) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

export function truncateIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  let ip = value.split(",")[0].trim();
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];

  if (/^(?:\d{1,3}\.){3}x$/i.test(ip) && isIP(`${ip.slice(0, -1)}0`) === 4) return ip;
  if (/^[0-9a-f]{1,4}:x$/i.test(ip)) return ip.toLowerCase();
  if (isIP(ip) === 4) {
    const octets = ip.split(".");
    return `${octets[0]}.${octets[1]}.${octets[2]}.x`;
  }
  if (isIP(ip) === 6) {
    const firstBlock = ip.startsWith("::") ? "0" : ip.split(":")[0];
    return `${firstBlock || "0"}:x`;
  }
  return null;
}
