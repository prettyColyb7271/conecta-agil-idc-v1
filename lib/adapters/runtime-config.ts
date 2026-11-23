import path from "node:path";
import type { AppMode } from "./types";

export function getAppMode(): AppMode {
  const configured = process.env.APP_MODE?.trim().toLowerCase();
  if (!configured) return "demo";
  if (configured === "demo" || configured === "local") return configured;
  throw new Error(`APP_MODE inválido (${configured}); usa demo o local.`);
}

export function getLocalDataDir(): string {
  const configured = process.env.LOCAL_DATA_DIR?.trim();
  const fallback = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ConectaAgil")
    : path.join(process.cwd(), "local-data");
  const dataDir = configured || fallback;
  if (dataDir.toLowerCase().includes("onedrive")) {
    console.warn("LOCAL_DATA_DIR está dentro de OneDrive; SQLite puede bloquearse o corromperse.");
  }
  return dataDir;
}
