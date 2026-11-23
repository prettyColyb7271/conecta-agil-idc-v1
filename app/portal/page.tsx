import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { listExpedientes } from "@/lib/data/expedientes";
import LocalPortal from "./LocalPortal";
import PortalClient from "./PortalClient";

export const instant = false;

export default async function PortalPage() {
  const user = await requireRole("cliente");
  if (getAppMode() === "local" && user) return <LocalPortal expediente={listExpedientes(user)[0] ?? null} />;
  return <PortalClient />;
}
