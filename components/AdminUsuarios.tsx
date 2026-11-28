"use client";

import { FormEvent, useEffect, useState } from "react";
import { Dot, EmptyState, MessageBox, MetricCard, PageHeading, Panel, SmallButton, StatusBadge } from "@/components/ui";
import { EstadoUsuario, ROLE_LABEL, Role, usuariosIniciales } from "@/data/mock";
import { formatoFechaHora } from "@/lib/fechas";
import RecoveryPanel from "@/components/RecoveryPanel";

const GRUPOS: { rol: Role; titulo: string }[] = [
  { rol: "cliente", titulo: "Clientes" },
  { rol: "coordinador_idc", titulo: "Gestor IDC" },
];
const DOT = { pendiente: "riesgo", activo: "entiempo", bloqueado: "atrasado" } as const;
const LABEL: Record<EstadoUsuario, string> = { pendiente: "Pendiente de revisión", activo: "Activo", bloqueado: "Bloqueado" };

type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  status: EstadoUsuario;
  last_login_at: string | null;
  responsible_count: number;
  must_change_password: number;
  mfa_enabled: number;
};
type RegistrationRequest = { id: string; email: string; display_name: string; requested_role: Role; created_at: string };
type UserSummary = { active: number; blocked: number; mfaPending: number };

const ROLE_PERMISSIONS: Array<{ role: Role; can: string; cannot: string }> = [
  { role: "cliente", can: "Consultar sus expedientes, capturar datos y aportar documentos.", cannot: "Ver otros expedientes, comentarios internos ni validar requisitos." },
  { role: "coordinador_idc", can: "Revisar documentos, observar y validar requisitos, cerrar Gates según la separación de funciones, generar formatos, registrar eventos de CFE y atender la recuperación de clientes.", cannot: "Gestionar cuentas que no sean clientes, llaves, secretos ni configuración de seguridad; validar lo que él mismo subió cuando lo impide la regla de cuatro ojos." },
  { role: "admin_seguridad", can: "Administrar cuentas, sesiones, recuperación, MFA, auditoría e integraciones.", cannot: "Ver documentos de expedientes, fijar contraseñas o validar Gates." },
  { role: "gestor_tramites_cfe", can: "Rol histórico deshabilitado.", cannot: "No tiene acceso operativo." },
];

export default function AdminUsuarios({ mode, role }: { mode: "demo" | "local"; role: Role | null }) {
  const usuarios = mode === "demo" ? usuariosIniciales : [];
  const [localUsers, setLocalUsers] = useState<AdminUser[]>([]);
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [search, setSearch] = useState("");
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [newManager, setNewManager] = useState({ displayName: "", email: "" });
  const [managerMessage, setManagerMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [setupUrl, setSetupUrl] = useState("");
  const [loading, setLoading] = useState(mode === "local" && Boolean(role));
  const [error, setError] = useState(mode === "local" && !role ? "No se pudo identificar la sesión administrativa." : "");
  const [success, setSuccess] = useState("");
  const isLocal = mode === "local";

  useEffect(() => {
    if (!isLocal || !role) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const endpoint = role === "admin_seguridad" ? "/api/admin/users" : "/api/coordinator/requests";
        const response = await fetch(endpoint, { signal: controller.signal });
        const data = await response.json() as { users?: AdminUser[]; requests?: RegistrationRequest[]; summary?: UserSummary; error?: string };
        if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar las cuentas.");
        if (data.users) setLocalUsers(data.users);
        if (data.summary) setSummary(data.summary);
        if (data.requests) setRequests(data.requests);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las cuentas.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [isLocal, role]);

  async function refreshUsers() {
    const response = await fetch("/api/admin/users");
    const data = await response.json() as { users?: AdminUser[]; summary?: UserSummary; error?: string };
    if (!response.ok || !data.users) throw new Error(data.error ?? "No se pudo actualizar la lista de cuentas.");
    setLocalUsers(data.users);
    if (data.summary) setSummary(data.summary);
  }

  async function decide(requestId: string, action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("Motivo obligatorio del rechazo:")?.trim() : undefined;
    if (action === "reject" && !reason) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/coordinator/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, action, reason }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No fue posible actualizar la solicitud.");
      setRequests((current) => current.filter((request) => request.id !== requestId));
      setSuccess(action === "approve" ? "Solicitud aprobada." : "Solicitud rechazada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar la solicitud.");
    }
  }

  async function change(userId: string, action: "block" | "unblock" | "revoke" | "reset_password" | "reset_client_password" | "disable_mfa") {
    const reason = action === "disable_mfa" ? window.prompt("Motivo obligatorio para desvincular MFA:")?.trim() : undefined;
    if (action === "disable_mfa" && !reason) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, action, reason }),
      });
      const data = await response.json() as { error?: string; setupUrl?: string; unassignedCount?: number };
      if (!response.ok) throw new Error(data.error ?? "No fue posible actualizar la cuenta.");
      if ((action === "reset_password" || action === "reset_client_password") && data.setupUrl) {
        setSetupUrl(data.setupUrl);
        setSuccess("Enlace de definición generado. Entrégalo a la persona titular; vence en 24 horas y solo puede usarse una vez.");
      } else if (action === "block" && data.unassignedCount) {
        setSuccess(`${data.unassignedCount} expediente(s) quedó(aron) sin responsable activo; se notificó a los demás Gestores IDC.`);
      } else {
        setSuccess("Cuenta actualizada.");
      }
      await refreshUsers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar la cuenta.");
    }
  }

  async function createManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManagerMessage(null);
    setSetupUrl("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_gestor", displayName: newManager.displayName, email: newManager.email }),
      });
      const data = await response.json() as { error?: string; setupUrl?: string };
      if (!response.ok) throw new Error(data.error ?? "No fue posible crear el Gestor IDC.");
      setNewManager({ displayName: "", email: "" });
      setSetupUrl(data.setupUrl ?? "");
      setManagerMessage({ tone: "success", text: "Gestor IDC creado. Entrega el enlace de un solo uso; vence en 24 horas." });
      await refreshUsers();
    } catch (cause) {
      setManagerMessage({ tone: "error", text: cause instanceof Error ? cause.message : "No fue posible crear el Gestor IDC." });
    }
  }

  if (isLocal && role === "coordinador_idc") {
    return (
      <div className="space-y-4">
        <PageHeading title="Solicitudes de registro" description="Revisa y responde las solicitudes pendientes." />
        <RecoveryPanel mode={mode} showHeading={false} />
        {error && <MessageBox tone="error">{error}</MessageBox>}
        {success && <MessageBox tone="success">{success}</MessageBox>}
        <Panel title="Solicitudes de registro">
          {loading ? <MessageBox>Cargando solicitudes…</MessageBox> : requests.length ? (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-3 text-sm">
                  <span><strong>{request.display_name}</strong><span className="ml-2 text-slate-600">{request.email}</span></span>
                  <span className="flex gap-2">
                    <SmallButton onClick={() => void decide(request.id, "approve")}>Aprobar</SmallButton>
                    <SmallButton onClick={() => void decide(request.id, "reject")}>Rechazar</SmallButton>
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState>No hay solicitudes pendientes.</EmptyState>}
        </Panel>
      </div>
    );
  }

  if (isLocal && role === "admin_seguridad") {
    const normalizedSearch = search.trim().toLocaleLowerCase("es-MX");
    const filteredUsers = localUsers.filter((user) =>
      `${user.display_name} ${user.email}`.toLocaleLowerCase("es-MX").includes(normalizedSearch),
    );
    return (
      <div className="space-y-4">
        <PageHeading title="Cuentas" description="Administra usuarios, accesos, recuperación y MFA." />
        {loading && <MessageBox>Cargando cuentas…</MessageBox>}
        {error && <MessageBox tone="error">{error}</MessageBox>}
        {success && <MessageBox tone="success">{success}</MessageBox>}
        {setupUrl && <MessageBox tone="warning">Enlace de un solo uso (vence en 24 horas): <span className="break-all font-semibold">{setupUrl}</span></MessageBox>}
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Cuentas activas" value={summary?.active ?? "—"} />
          <MetricCard label="Cuentas bloqueadas" value={summary?.blocked ?? "—"} />
          <MetricCard label="MFA pendiente (roles obligatorios)" value={summary?.mfaPending ?? "—"} />
        </div>
        <Panel title="Roles y permisos">
          <p className="mb-3 text-sm">Los permisos están definidos en el código y se aplican en el servidor. Esta matriz es de solo lectura; no hay interruptores.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {ROLE_PERMISSIONS.map((item) => (
              <article key={item.role} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <h3 className="font-bold">{ROLE_LABEL[item.role]}</h3>
                <p className="mt-2"><strong>Puede:</strong> {item.can}</p>
                <p className="mt-1"><strong>No puede:</strong> {item.cannot}</p>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="Alta de Gestor IDC">
          <form onSubmit={createManager} className="grid gap-3 rounded-lg bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-semibold">Nombre completo
              <input required value={newManager.displayName} onChange={(event) => setNewManager({ ...newManager, displayName: event.target.value })} className="mt-1 w-full rounded border p-2 font-normal" />
            </label>
            <label className="text-sm font-semibold">Correo
              <input required type="email" value={newManager.email} onChange={(event) => setNewManager({ ...newManager, email: event.target.value })} className="mt-1 w-full rounded border p-2 font-normal" />
            </label>
            <div className="self-end"><SmallButton type="submit">Crear Gestor IDC</SmallButton></div>
            {managerMessage && <div className="sm:col-span-2 lg:col-span-3"><MessageBox tone={managerMessage.tone}>{managerMessage.text}</MessageBox></div>}
          </form>
        </Panel>
        <Panel title="Cuentas locales">
          <label className="mb-3 block max-w-lg text-sm font-semibold">Buscar por nombre o correo
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded border bg-white p-2 font-normal" />
          </label>
          {loading ? <EmptyState>Cargando cuentas…</EmptyState> : filteredUsers.length ? (
            <ul className="space-y-2">
              {filteredUsers.map((user) => (
                <li key={user.id} className="min-w-0 rounded-lg bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-bold">{user.display_name}</p>
                      <p className="break-all text-xs text-slate-600">{user.email}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {ROLE_LABEL[user.role]} · Último acceso: {user.last_login_at ? formatoFechaHora(user.last_login_at) : "Nunca"} · Responsables: {user.responsible_count}
                      </p>
                    </div>
                    <StatusBadge tone={user.status === "activo" ? "positive" : user.status === "bloqueado" ? "negative" : "warning"}>{LABEL[user.status]}</StatusBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.status === "bloqueado"
                      ? <SmallButton onClick={() => void change(user.id, "unblock")}>Desbloquear</SmallButton>
                      : <SmallButton onClick={() => void change(user.id, "block")}>Bloquear</SmallButton>}
                    <SmallButton onClick={() => void change(user.id, "revoke")}>Revocar sesiones</SmallButton>
                    {user.role === "coordinador_idc" && <SmallButton onClick={() => void change(user.id, "reset_password")}>Restablecer contraseña</SmallButton>}
                    {user.role === "cliente" && <SmallButton onClick={() => void change(user.id, "reset_client_password")}>Generar recuperación</SmallButton>}
                    {Boolean(user.mfa_enabled) && <SmallButton onClick={() => void change(user.id, "disable_mfa")}>Desvincular MFA</SmallButton>}
                    {user.must_change_password === 1 && <StatusBadge tone="warning">Debe definir contraseña</StatusBadge>}
                    <StatusBadge tone={user.mfa_enabled ? "positive" : "neutral"}>MFA: {user.mfa_enabled ? "Activo" : "No vinculado"}</StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState>{search ? "No hay cuentas que coincidan con la búsqueda." : "No hay cuentas que mostrar."}</EmptyState>}
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Cuentas de ejemplo"
        description="Demostración: estos datos no se guardan y no provienen de la base local."
        badge={<StatusBadge tone="info">Ejemplo</StatusBadge>}
      />
      {GRUPOS.map((group) => (
        <Panel key={group.rol} title={group.titulo}>
          <ul className="space-y-2">
            {usuarios.filter((user) => user.rol === group.rol).map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-3 text-sm">
                <span><strong>{user.nombre}</strong><span className="ml-2 text-xs text-slate-600">{ROLE_LABEL[user.rol]}</span></span>
                <span className="flex items-center gap-2 text-xs font-bold"><Dot tipo={DOT[user.estado]} />{LABEL[user.estado]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      <MessageBox>Las acciones sobre estos datos de ejemplo no se guardan.</MessageBox>
    </div>
  );
}
