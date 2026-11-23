import { connection, NextResponse } from "next/server";
import { getAdapters } from "@/lib/adapters";

export async function GET() {
  await connection();
  const adapters = await getAdapters();
  const health = await adapters.db.health();

  const response: {
    modo: string;
    db: string;
    ok: boolean;
    schemaVersion?: number;
    counts?: Record<string, number>;
  } = {
    modo: adapters.mode,
    db: adapters.db.kind,
    ok: health.ok,
  };
  if (adapters.mode === "local") {
    response.schemaVersion = await adapters.db.schemaVersion();
    response.counts = (await adapters.db.tableCounts()) as Record<string, number>;
  }
  return NextResponse.json(response);
}
