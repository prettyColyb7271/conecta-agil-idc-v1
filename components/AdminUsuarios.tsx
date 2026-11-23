"use client";

import { useEffect, useState } from "react";
import { Dot, SmallButton } from "@/components/ui";
import { EstadoUsuario, ROLE_LABEL, Role, usuariosIniciales } from "@/data/mock";
import { useSession } from "@/lib/session";

const GRUPOS: { rol: Role; titulo: string }[] = [
  { rol: "cliente", titulo: "Clientes" },
  { rol: "coordinador_idc", titulo: "Gestor IDC" },
];
const DOT = { pendiente: "riesgo", activo: "entiempo", bloqueado: "atrasado" } as const;
const LABEL: Record<EstadoUsuario, string> = { pendiente: "Pendiente de revisión", activo: "Activo", bloqueado: "Bloqueado" };

export default function AdminUsuarios() {
  const session = useSession();
  const [usuarios, setUsuarios] = useState(usuariosIniciales);
  const [localUsers, setLocalUsers] = useState<{ id: string; email: string; display_name: string; role: Role; status: EstadoUsuario; last_login_at: string | null; responsible_count: number; must_change_password: number }[]>([]);
  const [requests, setRequests] = useState<{ id: string; email: string; display_name: string; requested_role: Role; created_at: string }[]>([]);
  const [newManager, setNewManager] = useState({ displayName: "", email: "" });
  const [managerMessage, setManagerMessage] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const localMode = process.env.NEXT_PUBLIC_MODO === "local";
  useEffect(() => {
    if (!localMode || !session) return;
    const endpoint = session.role === "admin_seguridad" ? "/api/admin/users" : "/api/coordinator/requests";
    void fetch(endpoint).then((response) => response.json()).then((data: { users?: typeof localUsers; requests?: typeof requests }) => {
      if (data.users) setLocalUsers(data.users);
      if (data.requests) setRequests(data.requests);
    });
  }, [localMode, session]);

  if (localMode && session?.role === "coordinador_idc") {
    const decide = async (requestId: string, action: "approve" | "reject") => {
      const reason = action === "reject" ? window.prompt("Motivo obligatorio del rechazo:")?.trim() : undefined;
      if (action === "reject" && !reason) return;
      await fetch("/api/coordinator/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, action, reason }),
      });
      setRequests((current) => current.filter((request) => request.id !== requestId));
    };
    return (
      <section className="overflow-hidden rounded-sm">
        <h3 className="bg-[#5885b1] px-3 py-1 text-sm font-bold text-white">Solicitudes de registro</h3>
        <div className="space-y-2 bg-[#b6cde3] p-3 text-[#0d1f33]">
          {requests.map((request) => (
            <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm">
              <span><b>{request.display_name}</b><span className="ml-2 text-xs text-slate-500">{request.email}</span></span>
              <span className="flex gap-2">
                <SmallButton onClick={() => void decide(request.id, "approve")}>Aprobar</SmallButton>
                <SmallButton onClick={() => void decide(request.id, "reject")}>Rechazar</SmallButton>
              </span>
            </div>
          ))}
          {!requests.length && <p className="text-sm">No hay solicitudes pendientes.</p>}
        </div>
      </section>
    );
  }

  if (localMode && session?.role === "admin_seguridad") {
    const refreshUsers = async () => {
      const response = await fetch("/api/admin/users");
      const data = await response.json() as { users: typeof localUsers };
      setLocalUsers(data.users);
    };
    const change = async (userId: string, action: "block" | "unblock" | "revoke" | "reset_password") => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const data = await response.json() as { error?: string; temporaryPassword?: string; unassignedCount?: number };
      if (!response.ok) {
        setManagerMessage(data.error ?? "No fue posible actualizar el usuario.");
      } else if (action === "reset_password" && data.temporaryPassword) {
        setTemporaryPassword(data.temporaryPassword);
        setManagerMessage("Contraseña temporal generada. Cópiala ahora, no se volverá a mostrar.");
      } else if (action === "block" && data.unassignedCount) {
        setManagerMessage(`${data.unassignedCount} expediente(s) quedó(aron) sin responsable activo; se notificó a los demás Gestores IDC.`);
      }
      await refreshUsers();
    };
    const createManager = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setManagerMessage("");
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_gestor", displayName: newManager.displayName, email: newManager.email }),
      });
      const data = await response.json() as { error?: string; temporaryPassword?: string };
      if (!response.ok) {
        setManagerMessage(data.error ?? "No fue posible crear el Gestor IDC.");
        return;
      }
      setNewManager({ displayName: "", email: "" });
      setTemporaryPassword(data.temporaryPassword ?? "");
      setManagerMessage("Gestor IDC creado. Cópiala ahora, no se volverá a mostrar.");
      await refreshUsers();
    };
    return (
      <section className="overflow-hidden rounded-sm">
        <h3 className="bg-[#5885b1] px-3 py-1 text-sm font-bold text-white">Administración de Gestores IDC</h3>
        <div className="space-y-2 bg-[#b6cde3] p-3 text-[#0d1f33]">
          <form onSubmit={createManager} className="grid gap-2 bg-white p-3 sm:grid-cols-4">
            <input required value={newManager.displayName} onChange={(event) => setNewManager({ ...newManager, displayName: event.target.value })} placeholder="Nombre completo" className="border px-2 py-1 text-sm" />
            <input required type="email" value={newManager.email} onChange={(event) => setNewManager({ ...newManager, email: event.target.value })} placeholder="Correo" className="border px-2 py-1 text-sm" />
            <button type="submit" className="border border-[#5885b1] px-2 py-1 text-sm font-bold sm:col-span-2">Crear Gestor IDC</button>
            {managerMessage && <p className="text-xs sm:col-span-4">{managerMessage}</p>}
            {temporaryPassword && <p className="break-all bg-amber-100 p-2 text-sm font-bold sm:col-span-4">Contraseña temporal (cópiala ahora, no se volverá a mostrar): {temporaryPassword}</p>}
          </form>
          {localUsers.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm">
              <span><b>{user.display_name}</b><span className="ml-2 text-xs text-slate-500">{user.email}</span><span className="ml-2 text-xs">Último acceso: {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "nunca"} · Responsables: {user.responsible_count}</span></span>
              <span className="flex gap-2">
                <span className="text-xs font-bold">{user.status}</span>
                {user.status === "bloqueado"
                  ? <SmallButton onClick={() => void change(user.id, "unblock")}>Desbloquear</SmallButton>
                  : <SmallButton onClick={() => void change(user.id, "block")}>Bloquear</SmallButton>}
                <SmallButton onClick={() => void change(user.id, "revoke")}>Revocar sesiones</SmallButton>
                {user.role === "coordinador_idc" && <SmallButton onClick={() => void change(user.id, "reset_password")}>Restablecer contraseña</SmallButton>}
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const cambiar = (id: string, estado: EstadoUsuario) =>
    setUsuarios((us) => us.map((u) => (u.id === id ? { ...u, estado } : u)));

  return (
    <section className="overflow-hidden rounded-sm">
      <h3 className="bg-[#5885b1] px-3 py-1 text-sm font-bold text-white">Administración de usuarios</h3>
      <div className="space-y-3 bg-[#b6cde3] p-3 text-[#0d1f33]">
        {GRUPOS.map((g) => (
          <div key={g.rol}>
            <h4 className="flex justify-between bg-[#8fb0d1] px-3 py-1 text-sm">
              <span>{g.titulo}</span><span>Estatus</span>
            </h4>
            <ul>
              {usuarios.filter((u) => u.rol === g.rol).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm">
                  <span>
                    <span className="font-bold">{u.nombre}</span>
                    <span className="ml-2 text-xs text-slate-500">{ROLE_LABEL[u.rol]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-xs font-bold"><Dot tipo={DOT[u.estado]} />{LABEL[u.estado]}</span>
                    {u.estado === "pendiente" && <SmallButton onClick={() => cambiar(u.id, "activo")}>Aprobar</SmallButton>}
                    {u.estado === "activo" && <SmallButton onClick={() => cambiar(u.id, "bloqueado")}>Bloquear</SmallButton>}
                    {u.estado === "bloqueado" && <SmallButton onClick={() => cambiar(u.id, "activo")}>Habilitar</SmallButton>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-slate-600">Demostración: los cambios no se guardan al recargar.</p>
      </div>
    </section>
  );
}
