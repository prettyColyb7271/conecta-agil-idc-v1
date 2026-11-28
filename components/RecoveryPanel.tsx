"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_LABEL, type Role } from "@/data/mock";
import { formatoFechaHora } from "@/lib/fechas";
import { EmptyState, MessageBox, MetricCard, PageHeading, Panel, SmallButton, StatusBadge } from "@/components/ui";
import ContactRevealGroup from "@/components/ContactRevealGroup";

type RecoveryStatus = "pendiente" | "atendida";
type RecoveryRequest = {
  id: string;
  email: string;
  status: RecoveryStatus;
  requestedAt: string;
  handledAt: string | null;
  accountExists: boolean;
  role: Role | null;
  accountStatus: "pendiente" | "activo" | "bloqueado" | "baja" | null;
  discarded: boolean;
  isSelf: boolean;
  contact: {
    userId: string;
    name: string | null;
    apellidos: string | null;
    telefono: string | null;
  } | null;
};
type RecoveryResponse = {
  requests: RecoveryRequest[];
  summary: { pending: number; handled7d: number; averageMinutes: number | null };
  error?: string;
};
type GeneratedCode = { value: string; expiresAt: string };

function accountStatusLabel(status: RecoveryRequest["accountStatus"]) {
  if (status === "activo") return "Activa";
  if (status === "bloqueado") return "Bloqueada";
  if (status === "pendiente") return "Pendiente";
  if (status === "baja") return "De baja";
  return "—";
}

function averageLabel(minutes: number | null) {
  if (minutes === null) return "Aún no hay datos";
  if (minutes < 1) return "Menos de 1 min";
  return `${Number(minutes.toFixed(1))} min`;
}

export default function RecoveryPanel({ mode, showHeading = true }: { mode: "demo" | "local"; showHeading?: boolean }) {
  const [tab, setTab] = useState<RecoveryStatus>("pendiente");
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [summary, setSummary] = useState<RecoveryResponse["summary"] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(mode === "local");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [setupUrl, setSetupUrl] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<GeneratedCode | null>(null);

  const load = useCallback(async (status: RecoveryStatus) => {
    if (mode !== "local") return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/recovery?status=${status}`);
      const data = await response.json() as RecoveryResponse;
      if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar las solicitudes.");
      setRequests(data.requests);
      setSummary(data.summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(tab); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, tab]);

  async function act(request: RecoveryRequest, action: "generate" | "generate_code" | "unblock" | "revoke" | "dismiss") {
    setBusy(`${request.id}:${action}`);
    setError("");
    setNotice(null);
    setSetupUrl("");
    setRecoveryCode(null);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          requestId: request.id,
          ...(action === "dismiss" ? { reason: reasons[request.id] ?? "" } : {}),
        }),
      });
      const data = await response.json() as { error?: string; setupUrl?: string; code?: string; expiresAt?: string };
      if (!response.ok) throw new Error(data.error ?? "No fue posible atender la solicitud.");
      if (data.setupUrl) {
        setSetupUrl(data.setupUrl);
        setNotice({ tone: "warning", text: "Enlace de un solo uso, válido durante 24 horas. Entrégalo únicamente a la persona titular." });
      } else if (data.code && data.expiresAt) {
        setRecoveryCode({ value: data.code, expiresAt: data.expiresAt });
        setNotice({ tone: "warning", text: "Entrega este código una sola vez por un medio verificado. Vence en 30 minutos." });
      } else {
        setNotice({ tone: "success", text: action === "dismiss" ? "Solicitud descartada con motivo." : "Solicitud atendida." });
      }
      await load(tab);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible atender la solicitud.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {showHeading && <PageHeading title="Recuperación de acceso" description="Atención de solicitudes con acciones auditadas; no se muestran contraseñas." />}
      {mode === "demo" ? (
        <MessageBox tone="warning">La recuperación real está disponible en modo local. No se muestran solicitudes de ejemplo.</MessageBox>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Solicitudes pendientes" value={summary?.pending ?? "—"} />
            <MetricCard label="Atendidas en 7 días" value={summary?.handled7d ?? "—"} />
            <MetricCard label="Tiempo promedio de atención" value={summary ? averageLabel(summary.averageMinutes) : "—"} />
          </div>
          {error && <MessageBox tone="error">{error}</MessageBox>}
          {notice && <MessageBox tone={notice.tone}>
            {notice.text}
            {setupUrl && <a className="mt-2 block break-all font-semibold underline" href={setupUrl}>{setupUrl}</a>}
            {recoveryCode && <p className="mt-2 text-lg font-bold tracking-widest" aria-label="Código de recuperación">{recoveryCode.value}</p>}
            {recoveryCode && <p className="text-xs">Vence: {formatoFechaHora(recoveryCode.expiresAt)}</p>}
          </MessageBox>}
          <Panel title="Solicitudes de recuperación">
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Solicitudes por estado">
              <SmallButton active={tab === "pendiente"} onClick={() => { setRecoveryCode(null); setTab("pendiente"); }}>Pendientes</SmallButton>
              <SmallButton active={tab === "atendida"} onClick={() => { setRecoveryCode(null); setTab("atendida"); }}>Atendidas</SmallButton>
            </div>
            {loading ? <MessageBox>Cargando solicitudes…</MessageBox> : requests.length === 0 ? (
              <EmptyState>{tab === "pendiente" ? "No hay solicitudes pendientes." : "No hay solicitudes atendidas."}</EmptyState>
            ) : (
              <ul className="space-y-3">
                {requests.map((request) => (
                  <li key={request.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{request.email}</p>
                        <p className="text-xs text-slate-600">Solicitada: {formatoFechaHora(request.requestedAt)}</p>
                        {request.accountExists ? (
                          <p className="mt-1 text-xs text-slate-700">
                            Cuenta existente · {request.role ? ROLE_LABEL[request.role] : "Rol no disponible"} · {accountStatusLabel(request.accountStatus)}
                          </p>
                        ) : <p className="mt-1 text-xs text-slate-600">No se encontró una cuenta asociada.</p>}
                        {request.contact && (
                          <>
                            {request.contact.name && <p className="mt-1 text-xs">Nombre: {request.contact.name}</p>}
                            <ContactRevealGroup userId={request.contact.userId} values={[
                              { field: "apellidos", label: "Apellidos", masked: request.contact.apellidos ?? "No capturados" },
                              { field: "email", label: "Correo", masked: request.email },
                              { field: "telefono_contacto", label: "Teléfono", masked: request.contact.telefono ?? "No capturado" },
                            ]} />
                          </>
                        )}
                      </div>
                      <StatusBadge tone={request.discarded ? "neutral" : request.status === "pendiente" ? "warning" : "positive"}>
                        {request.discarded ? "Descartada" : request.status === "pendiente" ? "Pendiente" : "Atendida"}
                      </StatusBadge>
                    </div>
                    {tab === "pendiente" && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        {request.accountExists && !request.isSelf && (
                          <>
                            {(request.role === "cliente" || request.role === "coordinador_idc") && (
                              <>
                                <SmallButton disabled={busy !== null} onClick={() => void act(request, "generate")}>
                                  {busy === `${request.id}:generate` ? "Generando…" : "Generar enlace de un solo uso"}
                                </SmallButton>
                                <SmallButton disabled={busy !== null} onClick={() => void act(request, "generate_code")}>
                                  {busy === `${request.id}:generate_code` ? "Generando…" : "Generar código"}
                                </SmallButton>
                              </>
                            )}
                            {request.accountStatus === "bloqueado" && (
                              <SmallButton disabled={busy !== null} onClick={() => void act(request, "unblock")}>Desbloquear</SmallButton>
                            )}
                            <SmallButton disabled={busy !== null} onClick={() => void act(request, "revoke")}>Revocar sesiones</SmallButton>
                          </>
                        )}
                        {!request.isSelf && <>
                          <label className="min-w-[220px] flex-1 text-xs font-semibold">
                            Motivo para descartar
                            <input
                              value={reasons[request.id] ?? ""}
                              onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                              maxLength={200}
                              className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm font-normal"
                            />
                          </label>
                          <SmallButton
                            disabled={busy !== null || (reasons[request.id] ?? "").trim().length < 5}
                            onClick={() => void act(request, "dismiss")}
                          >
                            Descartar
                          </SmallButton>
                        </>}
                        {request.isSelf && <p className="text-sm text-amber-900">Esta solicitud debe atenderla otra persona administradora.</p>}
                      </div>
                    )}
                    {tab === "atendida" && request.handledAt && (
                      <p className="mt-2 text-xs text-slate-600">Atendida: {formatoFechaHora(request.handledAt)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <MessageBox>Todas las acciones quedan en la bitácora. Nadie conoce ni fija la contraseña de otra persona.</MessageBox>
        </>
      )}
    </div>
  );
}
