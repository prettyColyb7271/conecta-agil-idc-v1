import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { listExpedientes } from "@/lib/data/expedientes";
import { listRequirementReview } from "@/lib/data/documents";
import LocalPortal from "./LocalPortal";
import PortalClient from "./PortalClient";

export const instant = false;

export default async function PortalPage() {
  const user = await requireRole("cliente");
  if (getAppMode() === "local" && user) {
    const expediente = listExpedientes(user)[0] ?? null;
    return <LocalPortal expediente={expediente} review={expediente ? listRequirementReview(user, expediente.id) : []} />;
  }
  return <PortalClient />;
}
