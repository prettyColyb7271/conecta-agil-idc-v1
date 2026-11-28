"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutboxEntry, ZohoProjectPreview } from "@/lib/zoho/outbox";

const eventLabels: Record<string, string> = {
  alta_expediente: "Alta de expediente",
  reasignacion_responsable: "Reasignación de responsable",
  responsable_bloqueado: "Responsable bloqueado",
  documento_cargado: "Documento recibido",
  escaneo_verificado: "Escaneo verificado",
  requisito_validado: "Requisito validado",
  requisito_observado: "Requisito observado",
  requisito_no_aplica: "Requisito no aplica",
  cierre_gate: "Cierre de Gate",
  reapertura_gate: "Reapertura de Gate",
  cierre_expediente: "Cierre de expediente",
  oficio_resolutivo_registrado: "Oficio resolutivo registrado",
  evidencia_firma_presencial_registrada: "Firma presencial registrada",
  evidencia_ingreso_acuse_registrada: "Acuse CFE registrado",
  evidencia_cfe_incompleto_registrada: "Reproceso CFE registrado",
  evidencia_contrato_registrada: "Contrato registrado",
  evidencia_uiie_registrada: "Visita UIIE registrada",
  evidencia_certificado_uiie_registrada: "Certificado UIIE registrado",
  evidencia_medidor_registrada: "Medidor registrado",
  evidencia_interconexion_registrada: "Interconexión registrada",
  evidencia_alta_comercial_registrada: "Alta comercial registrada",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "—";
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "short" }).format(parsed);
}

function formatTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function statusStyle(status: OutboxEntry["status"]) {
  if (status === "enviado") return "bg-emerald-100 text-emerald-900";
  if (status === "fallido") return "bg-red-100 text-red-900";
  return "bg-amber-100 text-amber-900";
}

export default function IntegrationsPanel({ transport, entries, projects }: {
  transport: string;
  entries: OutboxEntry[];
  projects: ZohoProjectPreview[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function retry(id: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/admin/integraciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No fue posible reintentar el envío.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible reintentar el envío.");
    } finally {
      setBusy(null);
    }
  }

  const groups: Array<[string, string]> = [
    ["pendiente", "Pendientes"],
    ["enviando", "En proceso"],
    ["enviado", "Enviados"],
    ["fallido", "Fallidos"],
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-sm bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Integraciones</h2>
            <p className="mt-1 text-sm text-slate-600">Transporte activo: <strong>{transport}</strong>. Los fallos de Zoho no detienen el expediente.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase">Zoho Projects</span>
        </div>
        {error && <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        {groups.map(([status, title]) => {
          const matching = entries.filter((entry) => entry.status === status);
          return (
            <div key={status} className="rounded-sm bg-white p-5 shadow-sm">
              <h3 className="font-bold">{title} <span className="text-sm font-normal text-slate-500">({matching.length})</span></h3>
              {matching.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin envíos.</p> : (
                <ul className="mt-3 divide-y divide-slate-200">
                  {matching.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        {entry.snapshot ? (
                          <p className="font-semibold">{entry.snapshot.folio} · {eventLabels[entry.eventType] ?? "Actualización de expediente"}</p>
                        ) : (
                          <p className="font-semibold">Registro no legible</p>
                        )}
                        <p className="text-xs text-slate-600">
                          {entry.snapshot && `Intentos: ${entry.attempts} · `}{formatDate(entry.lastAttemptAt ?? entry.createdAt)}
                        </p>
                        {entry.snapshot && entry.lastError && <p className="mt-1 text-xs text-red-800">{entry.lastError}</p>}
                        {entry.snapshot && entry.consolidatedAt && (
                          <p className="mt-1 text-xs text-slate-600">Consolidado en el envío de las {formatTime(entry.consolidatedAt)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyle(entry.status)}`}>{entry.status}</span>
                        {entry.retryable && (
                          <button
                            type="button"
                            onClick={() => void retry(entry.id)}
                            disabled={busy !== null}
                            className="rounded border border-[#1b3d66] px-3 py-1 text-sm font-semibold text-[#1b3d66] disabled:opacity-50"
                          >
                            {busy === entry.id ? "Reintentando…" : "Reintentar"}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded-sm bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-bold">Así se vería en Zoho Projects</h2>
          <p className="mt-1 text-sm text-slate-600">Maqueta construida solo con snapshots de la outbox. No muestra documentos, datos fiscales ni observaciones.</p>
        </div>
        {projects.length === 0 ? <p className="mt-4 text-sm text-slate-500">Aún no hay expedientes en la outbox.</p> : (
          <div className="mt-4 space-y-4">
            {projects.map((project) => (
              <article key={project.folio} className="rounded border border-slate-200">
                <header className="flex flex-wrap justify-between gap-2 bg-slate-50 px-4 py-3">
                  <h3 className="font-bold">{project.folio}</h3>
                  <p className="text-sm">Responsable: {project.responsible}</p>
                </header>
                <ol className="divide-y divide-slate-200">
                  {project.tasks.map((task) => (
                    <li key={task.gate} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold">{task.label}</h4>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs">{task.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Registro: {formatDate(task.openedAt)} · Cierre: {formatDate(task.closedAt)} · Responsable: {task.responsible}
                      </p>
                      {task.subtasks.length > 0 && (
                        <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
                          {task.subtasks.map((subtask, index) => (
                            <li key={`${subtask.code}-${index}`} className="flex flex-wrap justify-between gap-2 text-sm">
                              <span>{subtask.label}</span>
                              <span className="text-slate-600">{subtask.status} · {formatDate(subtask.date)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
