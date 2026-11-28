import RecoveryPanel from "@/components/RecoveryPanel";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";

export const instant = false;

export default async function RecoveryPage() {
  await requireRole("admin_seguridad");
  return <RecoveryPanel mode={getAppMode()} />;
}
