import AppShell from "@/components/AppShell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="cliente">{children}</AppShell>;
}
