import AccessLog from "@/components/AccessLog";
import { requireRole } from "@/lib/auth";
import { connection } from "next/server";

export const instant = false;

export default async function AccessPage() {
  await connection();
  await requireRole("admin_seguridad");
  return <AccessLog />;
}
