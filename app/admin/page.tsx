import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { getAdminDashboardData, getDemoAdminDashboardData } from "@/lib/admin/dashboard";
import { MessageBox } from "@/components/ui";
import AdminDashboard from "@/components/AdminInicio";

export const instant = false;

export default async function AdminInicio() {
  await requireRole("admin_seguridad");
  if (getAppMode() === "demo") return <AdminDashboard data={getDemoAdminDashboardData()} />;
  let data;
  try {
    data = getAdminDashboardData();
  } catch (error) {
    console.error("No fue posible consultar el tablero de seguridad.", error);
    return <MessageBox tone="error">No fue posible cargar el tablero de seguridad.</MessageBox>;
  }
  return <AdminDashboard data={data} />;
}
