import type { Key, ReactNode } from "react";
import type { Estatus } from "@/data/mock";

export function PageHeading({ title, description, badge }: { title: string; description?: string; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-[#0d1f33]">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {badge}
    </div>
  );
}

export function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#8fb0d1] shadow-sm">
      <h2 className="flex flex-wrap items-center justify-between gap-2 bg-[#5885b1] px-4 py-2 text-sm font-bold text-white">{title}</h2>
      <div className="bg-[#b6cde3] p-3 text-[#0d1f33] sm:p-4">{children}</div>
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

export function SmallButton({ children, onClick, active, disabled, type = "button" }: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-[#0d1f33]" : "bg-[#5885b1] hover:bg-[#3d6a99]"}`}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "positive" | "warning" | "negative" | "info" | "neutral"; title?: string }) {
  const styles = {
    positive: "bg-emerald-100 text-emerald-900",
    warning: "bg-amber-100 text-amber-950",
    negative: "bg-red-100 text-red-900",
    info: "bg-sky-100 text-sky-900",
    neutral: "bg-slate-100 text-slate-800",
  } as const;
  return <span title={title} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

export function MetricCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 break-words text-2xl font-extrabold text-[#0d1f33]">{value}</p>
      {detail && <div className="mt-1 text-xs text-slate-600">{detail}</div>}
    </div>
  );
}

export function MessageBox({ children, tone = "info" }: { children: ReactNode; tone?: "success" | "warning" | "error" | "info" }) {
  const styles = {
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
    warning: "border-amber-300 bg-amber-50 text-amber-950",
    error: "border-red-300 bg-red-50 text-red-900",
    info: "border-sky-300 bg-sky-50 text-sky-950",
  } as const;
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${styles[tone]}`}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-center text-sm text-slate-600">{children}</p>;
}

type TableColumn<Row> = { key: string; label: ReactNode; render: (row: Row) => ReactNode };
type TableRow<Row> = { key: Key; value: Row };

export function DataTable<Row>({ columns, rows, emptyMessage, ariaLabel, minWidth = "min-w-[640px]" }: {
  columns: TableColumn<Row>[];
  rows: TableRow<Row>[];
  emptyMessage: string;
  ariaLabel: string;
  minWidth?: "min-w-[560px]" | "min-w-[640px]" | "min-w-[760px]";
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table aria-label={ariaLabel} className={`w-full ${minWidth} text-left text-sm`}>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-700">
          <tr>{columns.map((column) => <th key={column.key} scope="col" className="px-3 py-2">{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length ? rows.map(({ key, value }) => (
            <tr key={key} className="align-top even:bg-slate-50/60">
              {columns.map((column) => <td key={column.key} className="px-3 py-2">{column.render(value)}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="px-3 py-5"><EmptyState>{emptyMessage}</EmptyState></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
