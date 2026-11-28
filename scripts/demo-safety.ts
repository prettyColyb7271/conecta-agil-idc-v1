import path from "node:path";

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function normalized(value: string): string {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function assertSafeDemoDataDir(): string {
  if (process.env.APP_MODE?.trim().toLowerCase() !== "local") {
    throw new Error("Los comandos de demo requieren APP_MODE=local.");
  }
  const configured = process.env.LOCAL_DATA_DIR?.trim();
  if (!configured) {
    throw new Error("Define LOCAL_DATA_DIR con una carpeta aislada antes de ejecutar el comando.");
  }

  const dataDir = path.resolve(configured);
  const realDataDir = path.resolve(
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ConectaAgil") : path.join(process.cwd(), "local-data"),
  );
  const workspace = path.resolve(process.cwd());
  const safePath = normalized(dataDir);
  const realPath = normalized(realDataDir);
  const workspacePath = normalized(workspace);
  if (
    safePath === normalized(path.parse(dataDir).root) ||
    isWithin(realPath, safePath) || isWithin(safePath, realPath) ||
    isWithin(workspacePath, safePath) || isWithin(safePath, workspacePath)
  ) {
    throw new Error("LOCAL_DATA_DIR debe ser una carpeta aislada, fuera de la base real y del workspace.");
  }
  return dataDir;
}
