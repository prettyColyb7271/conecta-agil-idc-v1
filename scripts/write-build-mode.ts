import fs from "node:fs";

const mode = process.env.APP_MODE?.trim().toLowerCase() || "demo";
if (mode !== "demo" && mode !== "local") throw new Error(`APP_MODE inválido para build: ${mode}`);
fs.writeFileSync(".build-mode", `${mode}\n`, "utf8");
console.log(`Build mode: ${mode}`);
