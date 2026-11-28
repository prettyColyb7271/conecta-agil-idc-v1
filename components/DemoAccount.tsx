"use client";

import AppShell from "@/components/AppShell";
import { MessageBox, PageHeading } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function DemoAccount() {
  const session = useSession();
  return (
    <AppShell role={session?.role ?? "cliente"}>
      <div className="space-y-4">
        <PageHeading title="Mi cuenta" description="Datos personales de contacto." />
        <MessageBox tone="warning">La demo no consulta ni guarda datos personales de cuentas.</MessageBox>
      </div>
    </AppShell>
  );
}
