import { requireRole } from "@/lib/auth";
import { getZohoDashboard } from "@/lib/zoho/outbox";
import IntegrationsPanel from "./IntegrationsPanel";

export const instant = false;

export default async function IntegracionesPage() {
  await requireRole("admin_seguridad");
  let dashboard: ReturnType<typeof getZohoDashboard> | undefined;
  try {
    dashboard = getZohoDashboard();
  } catch {
    console.error("No fue posible consultar las integraciones.");
  }
  if (!dashboard) {
    return (
      <div role="alert" className="rounded-sm border border-red-300 bg-red-50 p-5 text-sm text-red-900">
        No fue posible consultar las integraciones
      </div>
    );
  }
  return <IntegrationsPanel {...dashboard} />;
}
