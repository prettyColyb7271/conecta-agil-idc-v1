"use client";

import AppShell from "@/components/AppShell";
import { MessageBox, PageHeading, Panel, StatusBadge } from "@/components/ui";
import { ROLE_LABEL } from "@/data/mock";
import { useSession } from "@/lib/session";

export default function DemoSecurity() {
  const session = useSession();
  const role = session?.role ?? "cliente";
  return (
    <AppShell role={role}>
      <div className="space-y-4">
        <PageHeading
          title="Mi seguridad"
          description="Panel demostrativo; no consulta ni modifica la base local."
          badge={<StatusBadge tone="info">Ejemplo</StatusBadge>}
        />
        <Panel title="Estado de autenticación">
          <p>Perfil: {ROLE_LABEL[role]}.</p>
          <MessageBox tone="warning">No se muestra ningún QR, secreto ni código de respaldo en el modo demo.</MessageBox>
        </Panel>
      </div>
    </AppShell>
  );
}
