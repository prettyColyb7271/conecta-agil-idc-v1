import AppShell from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export const instant = false;

export default async function GestorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("coordinador_idc");
  return <AppShell role="coordinador_idc">{children}</AppShell>;
}
