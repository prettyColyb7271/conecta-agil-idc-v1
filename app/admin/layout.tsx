import AppShell from "@/components/AppShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="admin_seguridad">{children}</AppShell>;
}
