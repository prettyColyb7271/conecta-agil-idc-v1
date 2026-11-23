import GestorInicio from "@/components/GestorInicio";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import LocalGestorReview from "@/components/LocalGestorReview";

// Datos de ejemplo y estado en el navegador: se omite la validación instantánea (solo aviso de desarrollo)
export const instant = false;

export default async function Page() {
  const user = await requireRole("coordinador_idc");
  if (user?.mustChangePassword) redirect("/cambiar-contrasena");
  return getAppMode() === "local" ? <LocalGestorReview /> : <GestorInicio />;
}
