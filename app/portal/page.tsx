import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { cargarPortalCliente } from "./datos";
import LocalPortal from "./LocalPortal";
import PortalClient from "./PortalClient";

export const instant = false;

export default async function PortalPage() {
  const user = await requireRole("cliente");
  if (getAppMode() === "local" && user) {
    const { expediente, review } = cargarPortalCliente(user);
    return <LocalPortal expediente={expediente} review={review} />;
  }
  return <PortalClient />;
}
