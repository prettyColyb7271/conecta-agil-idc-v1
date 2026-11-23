import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const instant = false;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireRole("cliente");
  return <AppShell role="cliente">{children}</AppShell>;
}
