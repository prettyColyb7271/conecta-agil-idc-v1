import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin_seguridad");
  return <AppShell role="admin_seguridad">{children}</AppShell>;
}
