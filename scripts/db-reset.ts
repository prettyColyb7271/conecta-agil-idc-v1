import { getAppMode } from "@/lib/adapters/runtime-config";
import { resetDatabase } from "@/lib/db/sqlite-runtime";

if (getAppMode() !== "local") throw new Error("db:reset solo puede ejecutarse con NEXT_PUBLIC_MODO=local.");
if (process.env.CONFIRM !== "1") throw new Error("Para borrar la base local usa CONFIRM=1.");

resetDatabase();
console.log("Base SQLite local eliminada.");
