"use client";

import { useEffect, useState } from "react";
import { Dot, SmallButton } from "@/components/ui";
import { EstadoUsuario, ROLE_LABEL, Role, usuariosIniciales } from "@/data/mock";
import { useSession } from "@/lib/session";

const GRUPOS: { rol: Role; titulo: string }[] = [
  { rol: "cliente", titulo: "Clientes" },
  { rol: "coordinador_idc", titulo: "Coordinador IDC" },
  { rol: "gestor_tramites_cfe", titulo: "Gestor CFE (IDC)" },
];
const DOT = { pendiente: "riesgo", activo: "entiempo", bloqueado: "atrasado" } as const;
const LABEL: Record<EstadoUsuario, string> = { pendiente: "Pendiente de revisión", activo: "Activo", bloqueado: "Bloqueado" };

export default function AdminUsuarios() {
  const session = useSession();
  const [usuarios, setUsuarios] = useState(usuariosIniciales);
  const [localUsers, setLocalUsers] = useState<{ id: string; email: string; display_name: string; role: Role; status: EstadoUsuario }[]>([]);
  const [requests, setRequests] = useState<{ id: string; email: string; display_name: string; requested_role: Role; created_at: string }[]>([]);
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
    const change = async (userId: string, action: "block" | "unblock" | "revoke") => {
      await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const response = await fetch("/api/admin/users");
      const data = await response.json() as { users: typeof localUsers };
      setLocalUsers(data.users);
    };
    return (
      <section className="overflow-hidden rounded-sm">
        <h3 className="bg-[#5885b1] px-3 py-1 text-sm font-bold text-white">Administración de usuarios</h3>
        <div className="space-y-2 bg-[#b6cde3] p-3 text-[#0d1f33]">
          {localUsers.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm">
              <span><b>{user.display_name}</b><span className="ml-2 text-xs text-slate-500">{user.email}</span></span>
              <span className="flex gap-2">
                <span className="text-xs font-bold">{user.status}</span>
                {user.status === "bloqueado"
                  ? <SmallButton onClick={() => void change(user.id, "unblock")}>Desbloquear</SmallButton>
                  : <SmallButton onClick={() => void change(user.id, "block")}>Bloquear</SmallButton>}
                <SmallButton onClick={() => void change(user.id, "revoke")}>Revocar sesiones</SmallButton>
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
