import { NextResponse } from "next/server";
import { getAdapters } from "@/lib/adapters";

export async function GET() {
  const adapters = await getAdapters();
  const health = await adapters.db.health();

  return NextResponse.json({
    modo: adapters.mode,
    db: adapters.db.kind,
    ok: health.ok,
  });
}
