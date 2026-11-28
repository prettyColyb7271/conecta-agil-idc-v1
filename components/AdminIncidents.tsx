"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, MessageBox, MetricCard, PageHeading, Panel, SmallButton, StatusBadge } from "@/components/ui";
import type { IncidentAlert, IncidentsDashboard } from "@/lib/admin/incidents";

type DashboardResponse = IncidentsDashboard & { error?: string };

function auditHref(alert: IncidentAlert) {
  const params = new URLSearchParams({ eventIds: alert.eventIds.join(",") });
  return `/admin/accesos?${params}`;
}

export default function AdminIncidents({ mode }: { mode: "demo" | "local" }) {
  const [data, setData] = useState<IncidentsDashboard | null>(null);
  const [loading, setLoading] = useState(mode === "local");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (mode !== "local") return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/incidents");
      const result = await response.json() as DashboardResponse;
      if (!response.ok) throw new Error(result.error ?? "No se pudieron cargar las alertas.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las alertas.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(userId: string, action: "block" | "unblock" | "revoke") {
    setBusy(`${userId}:${action}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo completar la acción.");
      setNotice(action === "revoke" ? "Sesiones revocadas." : action === "block" ? "Cuenta bloqueada." : "Cuenta desbloqueada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeading title="Seguridad e incidentes" description="Alertas calculadas únicamente desde eventos reales de la bitácora." />
      {mode === "demo" && <MessageBox tone="warning">El modo demo no muestra alertas ficticias; los incidentes requieren eventos locales reales.</MessageBox>}
      {error && <MessageBox tone="error">{error}</MessageBox>}
      {notice && <MessageBox tone="success">{notice}</MessageBox>}
      {mode === "local" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Alertas en 24 horas" value={data?.alerts24h ?? "—"} />
            <MetricCard label="Alertas en 7 días" value={data?.alerts7d ?? "—"} />
            <MetricCard label="Cuentas bloqueadas" value={data?.blockedAccounts ?? "—"} />
          </div>
          <Panel title="Alertas detectadas">
            {loading ? <MessageBox>Cargando alertas…</MessageBox> : !data?.alerts.length ? (
              <EmptyState>No hay alertas reales en los últimos 7 días.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {data.alerts.map((alert) => (
                  <li key={alert.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold">{alert.title}</h3>
                        <p className="text-sm">{alert.subject}</p>
                        <p className="text-xs text-slate-600">Detectada: {alert.detectedLabel} · {alert.eventCount} evento(s)</p>
                      </div>
                      <StatusBadge tone="negative">Revisar</StatusBadge>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-700">
                      {alert.events.map((event) => <li key={event.id}>{event.date} · {event.label}</li>)}
                    </ul>
                    {alert.eventsTruncated && <p className="mt-1 text-xs text-slate-600">Se muestran los 100 eventos más recientes.</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link className="text-sm font-semibold underline" href={auditHref(alert)}>Ver eventos en Auditoría</Link>
                      {alert.userId && (
                        <>
                          {alert.userStatus === "bloqueado"
                            ? <SmallButton disabled={busy !== null} onClick={() => void act(alert.userId!, "unblock")}>Desbloquear cuenta</SmallButton>
                            : <SmallButton disabled={busy !== null} onClick={() => void act(alert.userId!, "block")}>Bloquear cuenta</SmallButton>}
                          <SmallButton disabled={busy !== null} onClick={() => void act(alert.userId!, "revoke")}>
                            {busy === `${alert.userId}:revoke` ? "Revocando…" : "Revocar sesiones"}
                          </SmallButton>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
      <Panel title="Proceso de atención">
        <ol className="grid gap-2 sm:grid-cols-5">
          {[
            ["Detectar", "Revisar las alertas derivadas de la bitácora."],
            ["Analizar", "Confirmar la cuenta o IP truncada y los eventos."],
            ["Contener", "Bloquear la cuenta o revocar sesiones si procede."],
            ["Notificar", "Avisar al responsable por el canal operativo."],
            ["Cerrar", "Registrar el seguimiento fuera de este tablero."],
          ].map(([step, description], index) => (
            <li key={step} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="font-bold">{index + 1}. {step}</p>
              <p className="mt-1 text-xs text-slate-600">{description}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-700">El ciclo con estado Abierto/Mitigado, responsable y notas queda para una fase futura.</p>
      </Panel>
    </div>
  );
}
