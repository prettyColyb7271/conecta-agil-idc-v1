import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import IntegrationsPanel from "./IntegrationsPanel";
import type { OutboxEntry, ZohoGateTask, ZohoProjectPreview } from "@/lib/zoho/outbox";
import { MessageBox } from "@/components/ui";

export const instant = false;

function getDemoDashboard() {
  const tasks: ZohoGateTask[] = Array.from({ length: 8 }, (_, index) => ({
    gate: index + 1,
    label: `Gate ${index + 1}`,
    status: index === 0 ? "Cerrado" : index === 1 ? "En proceso" : "Pendiente",
    openedAt: null,
    closedAt: null,
    responsible: "Gestor de ejemplo",
    subtasks: index === 1 ? [{ code: "R06", label: "Documento de ejemplo", status: "Pendiente", date: null }] : [],
  }));
  const project: ZohoProjectPreview = { folio: "IDC-DEMO-0001", responsible: "Gestor de ejemplo", tasks };
  const entries: OutboxEntry[] = [
    { id: "demo-sent", eventType: "alta_expediente", status: "enviado", attempts: 1, lastError: null, lastAttemptAt: null, createdAt: "2026-11-27T10:00:00.000Z", snapshot: { version: 1, eventType: "alta_expediente", folio: project.folio, createdAt: "2026-11-27T10:00:00.000Z", responsible: project.responsible, tasks }, retryable: false, consolidatedAt: null },
    { id: "demo-pending", eventType: "requisito_validado", status: "pendiente", attempts: 0, lastError: null, lastAttemptAt: null, createdAt: "2026-11-27T10:15:00.000Z", snapshot: { version: 1, eventType: "requisito_validado", folio: project.folio, createdAt: "2026-11-27T10:15:00.000Z", responsible: project.responsible, tasks }, retryable: false, consolidatedAt: null },
    { id: "demo-failed", eventType: "requisito_observado", status: "fallido", attempts: 1, lastError: "Error de ejemplo", lastAttemptAt: "2026-11-27T10:20:00.000Z", createdAt: "2026-11-27T10:18:00.000Z", snapshot: { version: 1, eventType: "requisito_observado", folio: project.folio, createdAt: "2026-11-27T10:18:00.000Z", responsible: project.responsible, tasks }, retryable: false, consolidatedAt: null },
  ];
  return { transport: "file", entries, projects: [project] };
}

export default async function IntegracionesPage() {
  await requireRole("admin_seguridad");
  if (getAppMode() === "demo") {
    return <IntegrationsPanel {...getDemoDashboard()} example />;
  }
  let dashboard: { transport: string; entries: OutboxEntry[]; projects: ZohoProjectPreview[] } | null = null;
  try {
    const { getZohoDashboard } = await import("@/lib/zoho/outbox");
    dashboard = getZohoDashboard();
  } catch (error) {
    console.error("No fue posible consultar las integraciones.", error);
    return <MessageBox tone="error">No fue posible consultar las integraciones.</MessageBox>;
  }
  return <IntegrationsPanel {...dashboard} example={false} />;
}
