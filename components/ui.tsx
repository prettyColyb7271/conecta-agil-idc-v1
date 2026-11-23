import { ReactNode } from "react";
import type { Estatus } from "@/data/mock";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-sm">
      <h3 className="bg-[#5885b1] px-3 py-1 text-sm font-bold text-white">{title}</h3>
      <div className="bg-[#b6cde3] p-3 text-[#0d1f33]">{children}</div>
    </section>
  );
}

const COLORS = { atrasado: "bg-red-500", riesgo: "bg-amber-400", entiempo: "bg-green-500" } as const;
export const ESTATUS_LABEL: Record<Estatus, string> = {
  atrasado: "Atrasado",
  riesgo: "Con riesgo",
  entiempo: "En tiempo",
};

export function Dot({ tipo }: { tipo: Estatus | "urgente" }) {
  const c = tipo === "urgente" ? "bg-red-500" : COLORS[tipo];
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${c}`} aria-hidden />;
}

export function SmallButton({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-semibold text-white ${active ? "bg-[#0d1f33]" : "bg-[#5885b1] hover:bg-[#3d6a99]"}`}
    >
      {children}
    </button>
  );
}
