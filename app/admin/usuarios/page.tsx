import AdminUsuarios from "@/components/AdminUsuarios";
import { requireRole } from "@/lib/auth";

export default async function Page() {
  await requireRole("admin_seguridad");
  return <AdminUsuarios />;
}
