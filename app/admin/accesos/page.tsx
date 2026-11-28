import AccessLog from "@/components/AccessLog";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { connection } from "next/server";
import type { AccessLogFilters } from "@/components/AccessLog";

export const instant = false;

type QueryValue = string | string[] | undefined;

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, QueryValue>> }) {
  await connection();
  await requireRole("admin_seguridad");
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const initialFilters: AccessLogFilters = {
    from: value("from"),
    to: value("to"),
    userId: value("userId"),
    eventType: value("eventType"),
    folio: value("folio"),
    eventIds: value("eventIds"),
  };
  return <AccessLog mode={getAppMode()} initialFilters={initialFilters} />;
}
