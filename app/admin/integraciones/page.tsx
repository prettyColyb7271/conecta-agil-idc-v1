import { requireRole } from "@/lib/auth";
import { getZohoDashboard } from "@/lib/zoho/outbox";
import IntegrationsPanel from "./IntegrationsPanel";

export const instant = false;

export default async function IntegracionesPage() {
  await requireRole("admin_seguridad");
  const dashboard = getZohoDashboard();
  return <IntegrationsPanel {...dashboard} />;
}
