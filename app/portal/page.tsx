import { requireRole } from "@/lib/auth";
import PortalClient from "./PortalClient";

export const instant = false;

export default async function PortalPage() {
  await requireRole("cliente");
  return <PortalClient />;
}
