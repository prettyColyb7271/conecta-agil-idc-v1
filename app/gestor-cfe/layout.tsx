import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const instant = false;

export default async function GestorCfeLayout({ children }: { children: React.ReactNode }) {
  await requireRole("gestor_tramites_cfe");
  return <AppShell role="gestor_tramites_cfe">{children}</AppShell>;
}
