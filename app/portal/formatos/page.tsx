import FormatosCFE from "@/components/FormatosCFE";
import { requireRole } from "@/lib/auth";

// Pantalla con datos de ejemplo y estado en el navegador: se omite la validación instantánea (solo aviso de desarrollo)
export const instant = false;

export default async function Page() {
  await requireRole("cliente");
  return <FormatosCFE />;
}
