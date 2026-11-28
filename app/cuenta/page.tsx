import AccountContact from "@/components/AccountContact";
import AppShell from "@/components/AppShell";
import DemoAccount from "@/components/DemoAccount";
import { getAppMode } from "@/lib/adapters/config";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { PageHeading } from "@/components/ui";
import { redirect } from "next/navigation";

export const instant = false;

export default async function CuentaPage() {
  if (getAppMode() === "demo") return <DemoAccount />;
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/clear?next=/");
  if (user.role !== "cliente" && user.role !== "coordinador_idc") redirect(user.role === "admin_seguridad" ? "/admin" : "/gestor");
  await requireRole(user.role);
  return (
    <AppShell role={user.role}>
      <div className="space-y-4">
        <PageHeading title="Mi cuenta" description="Actualiza los datos de contacto de tu cuenta." />
        <AccountContact />
      </div>
    </AppShell>
  );
}
