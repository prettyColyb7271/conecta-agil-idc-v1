"use client";

import { useState } from "react";
import { Dot, SmallButton } from "@/components/ui";
import { EstadoUsuario, ROLE_LABEL, Role, usuariosIniciales } from "@/data/mock";

const GRUPOS: { rol: Role; titulo: string }[] = [
  { rol: "cliente", titulo: "Clientes" },
  { rol: "coordinador_idc", titulo: "Coordinador IDC" },
  { rol: "gestor_tramites_cfe", titulo: "Gestor CFE (IDC)" },
];
const DOT = { pendiente: "riesgo", activo: "entiempo", bloqueado: "atrasado" } as const;
const LABEL: Record<EstadoUsuario, string> = { pendiente: "Pendiente de revisión", activo: "Activo", bloqueado: "Bloqueado" };

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState(usuariosIniciales);
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
