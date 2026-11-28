import fs from "node:fs";
import path from "node:path";

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function normalized(value: string): string {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function canonicalPath(value: string): string {
  let existing = path.resolve(value);
  const suffix: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  return path.resolve(fs.realpathSync.native(existing), ...suffix);
}

export function assertSafeDemoDataDir(): string {
  if (process.env.APP_MODE?.trim().toLowerCase() !== "local") {
    throw new Error("Los comandos de demo requieren APP_MODE=local.");
  }
  const configured = process.env.LOCAL_DATA_DIR?.trim();
  if (!configured) {
    throw new Error("Define LOCAL_DATA_DIR con una carpeta aislada antes de ejecutar el comando.");
  }

  const dataDir = canonicalPath(configured);
  const realDataDir = canonicalPath(
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ConectaAgil") : path.join(process.cwd(), "local-data"),
  );
  const workspace = canonicalPath(process.cwd());
  const safePath = normalized(dataDir);
  const realPath = normalized(realDataDir);
  const workspacePath = normalized(workspace);
  const oneDriveRoots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]
    .filter((value): value is string => Boolean(value?.trim() && fs.existsSync(value)))
    .map((value) => normalized(canonicalPath(value)));
  const containsOneDriveSegment = dataDir.split(/[\\/]+/).some((part) => part.toLowerCase() === "onedrive");
  if (
    safePath === normalized(path.parse(dataDir).root) ||
    isWithin(realPath, safePath) || isWithin(safePath, realPath) ||
    isWithin(workspacePath, safePath) || isWithin(safePath, workspacePath) ||
    containsOneDriveSegment || oneDriveRoots.some((root) => isWithin(root, safePath))
  ) {
    throw new Error("LOCAL_DATA_DIR debe ser una carpeta aislada, fuera de la base real, OneDrive y el workspace.");
  }
  return dataDir;
}
