import { migrateDatabase } from "@/lib/db/sqlite-runtime";

console.log(`Migraciones aplicadas. schemaVersion=${migrateDatabase()}`);
