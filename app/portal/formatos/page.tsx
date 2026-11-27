import FormatosCFE from "@/components/FormatosCFE";
import { getAppMode } from "@/lib/adapters/config";
import { requireRole } from "@/lib/auth";
import { cargarPortalCliente } from "../datos";
import LocalDocumentos from "./LocalDocumentos";

// Pantalla con datos de ejemplo y estado en el navegador: se omite la validación instantánea (solo aviso de desarrollo)
export const instant = false;

export default async function Page() {
  const user = await requireRole("cliente");
  if (getAppMode() === "local" && user) {
    const { expediente, review, formats } = cargarPortalCliente(user);
    return <LocalDocumentos expediente={expediente} review={review} formats={formats} />;
  }
  return <FormatosCFE />;
}
