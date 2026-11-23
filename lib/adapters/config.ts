import "server-only";

import path from "node:path";
import type { AppMode } from "./types";

export function getAppMode(): AppMode {
  const configured = process.env.NEXT_PUBLIC_MODO?.trim().toLowerCase();
  if (!configured) return "demo";
  if (configured === "demo" || configured === "local") return configured;

  console.warn(`NEXT_PUBLIC_MODO inválido (${configured}); se usará demo.`);
  return "demo";
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
