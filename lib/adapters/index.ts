import "server-only";

import { getAppMode } from "./config";
import type { AppAdapters } from "./types";

export async function getAdapters(): Promise<AppAdapters> {
  const mode = getAppMode();

  if (mode === "local") {
    const { createLocalAdapters } = await import("./local");
    return { mode, ...createLocalAdapters() };
  }

  const { createMockAdapters } = await import("./mock");
  return { mode, ...createMockAdapters() };
}
