import AdminUsuarios from "@/components/AdminUsuarios";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { connection } from "next/server";

export const instant = false;

export default async function Page() {
  await connection();
  const user = await requireRole("admin_seguridad");
  return <AdminUsuarios mode={getAppMode()} role={user?.role ?? null} />;
}
