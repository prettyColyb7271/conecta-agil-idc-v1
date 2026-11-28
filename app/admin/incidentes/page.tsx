import { requireRole } from "@/lib/auth";
import AdminIncidents from "@/components/AdminIncidents";
import { getAppMode } from "@/lib/adapters/config";

export const instant = false;

export default async function IncidentesPage() {
  await requireRole("admin_seguridad");
  return <AdminIncidents mode={getAppMode()} />;
}
