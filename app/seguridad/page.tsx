import MfaSetup from "@/components/MfaSetup";
import { EmptyState, MessageBox, MetricCard, PageHeading, Panel, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { connection } from "next/server";

export const instant = false;

export default async function SeguridadPage() {
  await connection();
  await requireRole("admin_seguridad", { allowMfaSetup: true });
  if (getAppMode() === "demo") {
    return (
      <div className="space-y-4">
        <PageHeading
          title="Seguridad de la cuenta"
          description="Panel demostrativo; no consulta ni modifica la base local."
          badge={<StatusBadge tone="info">Ejemplo</StatusBadge>}
        />
        <Panel title="Estado de autenticación">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Cuentas con MFA activo" value="1" detail="Dato demostrativo" />
            <MetricCard label="Roles con MFA obligatorio" value="1" detail="Administración de seguridad" />
          </div>
          <MessageBox tone="warning">No se muestra ningún QR, secreto ni código de respaldo en el modo demo.</MessageBox>
        </Panel>
        <Panel title="Sincronización">
          <EmptyState>Los cambios de acceso se administran localmente y no se sincronizan con Zoho.</EmptyState>
        </Panel>
        <MessageBox tone="warning">No proyectes esta pantalla: el QR y los códigos dan acceso a la cuenta.</MessageBox>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeading title="Seguridad de la cuenta" description="Administra la vinculación MFA de esta cuenta." />
      <MfaSetup />
      <MessageBox>Los eventos de seguridad se registran en la bitácora administrativa sin guardar secretos de autenticación.</MessageBox>
    </div>
  );
}
