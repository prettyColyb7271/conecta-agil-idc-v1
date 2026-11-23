import AppShell from "@/components/AppShell";

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="coordinador_idc">{children}</AppShell>;
}
