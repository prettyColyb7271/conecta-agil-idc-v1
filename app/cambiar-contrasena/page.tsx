import ChangePasswordForm from "@/components/ChangePasswordForm";
import { requireRole } from "@/lib/auth";

export const instant = false;

export default async function Page() {
  await requireRole("coordinador_idc", { allowPasswordChange: true });
  return <ChangePasswordForm />;
}
