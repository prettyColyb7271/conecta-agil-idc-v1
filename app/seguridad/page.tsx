import MfaSetup from "@/components/MfaSetup";
import { requireRole } from "@/lib/auth";
import { connection } from "next/server";

export const instant = false;

export default async function SeguridadPage() {
  await connection();
  await requireRole("admin_seguridad", { allowMfaSetup: true });
  return <MfaSetup />;
}
