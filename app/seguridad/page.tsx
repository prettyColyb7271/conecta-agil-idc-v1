import AppShell from "@/components/AppShell";
import MfaSetup from "@/components/MfaSetup";
import DemoSecurity from "@/components/DemoSecurity";
import { MessageBox, PageHeading } from "@/components/ui";
import { getCurrentUser, mfaEnabled, mfaRequiredForRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { connection } from "next/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function SeguridadPage() {
  await connection();
  if (getAppMode() === "demo") {
    return <DemoSecurity />;
  }
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/clear?next=/");
  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  const navigationDisabled = mfaRequiredForRole(user.role) && !mfaEnabled(user.id);
  return (
    <AppShell role={user.role} navigationDisabled={navigationDisabled}>
      <div className="space-y-4">
        <PageHeading title="Mi seguridad" description="Administra la protección de acceso de tu cuenta." />
        <MfaSetup required={mfaRequiredForRole(user.role)} />
        <MessageBox>Los eventos de seguridad se registran en la bitácora administrativa sin guardar secretos de autenticación.</MessageBox>
      </div>
    </AppShell>
  );
}
