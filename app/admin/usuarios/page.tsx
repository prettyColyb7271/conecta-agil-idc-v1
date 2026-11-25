import AdminUsuarios from "@/components/AdminUsuarios";
import { requireRole } from "@/lib/auth";
import { connection } from "next/server";

export const instant = false;

export default async function Page() {
  await connection();
  await requireRole("admin_seguridad");
  return <AdminUsuarios />;
}
