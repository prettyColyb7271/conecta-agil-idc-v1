import AdminUsuarios from "@/components/AdminUsuarios";
import { requireRole } from "@/lib/auth";

// Datos de ejemplo y estado en el navegador: se omite la validación instantánea (solo aviso de desarrollo)
export const instant = false;

export default async function Page() {
  await requireRole("coordinador_idc");
  return <AdminUsuarios />;
}
