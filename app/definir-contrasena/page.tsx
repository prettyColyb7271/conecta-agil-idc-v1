import SetupPasswordForm from "@/components/SetupPasswordForm";
import { Suspense } from "react";

export const instant = false;

export default function Page() {
  return <Suspense fallback={<main className="mx-auto mt-12 max-w-md p-6">Cargando…</main>}><SetupPasswordForm /></Suspense>;
}
