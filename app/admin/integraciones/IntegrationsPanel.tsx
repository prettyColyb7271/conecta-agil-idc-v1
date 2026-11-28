"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OutboxEntry, ZohoProjectPreview } from "@/lib/zoho/outbox";
import { EmptyState, MessageBox, PageHeading, Panel, SmallButton, StatusBadge } from "@/components/ui";

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

export default function IntegrationsPanel({ transport, entries, projects, example }: {
  transport: string;
  entries: OutboxEntry[];
  projects: ZohoProjectPreview[];
  example: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function retry(id: string) {
    if (example) return;
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
    <div className="space-y-4">
      <PageHeading
        title="Integraciones"
        description={`Transporte activo: ${transport}. Los fallos de Zoho no detienen el flujo del expediente.`}
        badge={example ? <StatusBadge tone="info">Ejemplo</StatusBadge> : <StatusBadge>Zoho Projects</StatusBadge>}
      />
      {error && <MessageBox tone="error">{error}</MessageBox>}
      {example && <MessageBox tone="warning">Datos ficticios para demostración. No se consulta la outbox ni se realizan envíos.</MessageBox>}
      <MessageBox>La sincronización es de un solo sentido: la plataforma decide y Zoho muestra. Solo se envían metadatos de tareas; documentos y observaciones internas permanecen en la aplicación.</MessageBox>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([status, title]) => {
          const matching = entries.filter((entry) => entry.status === status);
          return (
            <Panel key={status} title={<>{title}<StatusBadge>{matching.length}</StatusBadge></>}>
              {matching.length === 0 ? <EmptyState>Sin envíos.</EmptyState> : (
                <ul className="divide-y divide-slate-200 rounded bg-white px-3">
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
                        <StatusBadge tone={entry.status === "enviado" ? "positive" : entry.status === "fallido" ? "negative" : "warning"}>{entry.status}</StatusBadge>
                        {!example && entry.retryable && (
                          <SmallButton onClick={() => void retry(entry.id)} disabled={busy !== null}>
                            {busy === entry.id ? "Reintentando…" : "Reintentar"}
                          </SmallButton>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel title="Así se vería en Zoho Projects">
        <p className="mb-3 text-sm text-slate-700">Maqueta construida solo con snapshots de la outbox. No muestra documentos, datos fiscales ni observaciones internas.</p>
        {projects.length === 0 ? <EmptyState>Aún no hay expedientes en la outbox.</EmptyState> : (
          <div className="space-y-4">
            {projects.map((project) => (
              <article key={project.folio} className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
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
      </Panel>
    </div>
  );
}
