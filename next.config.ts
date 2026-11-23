import fs from "node:fs";
import type { NextConfig } from "next";

const buildModePath = ".build-mode";
const buildMode = fs.existsSync(buildModePath) ? fs.readFileSync(buildModePath, "utf8").trim() : null;
const runtimeMode = process.env.APP_MODE?.trim().toLowerCase();
if (buildMode && runtimeMode && buildMode !== runtimeMode) {
  throw new Error(`APP_MODE=${runtimeMode} no coincide con el modo del build (${buildMode}). Ejecuta npm run build con el mismo APP_MODE.`);
}

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
