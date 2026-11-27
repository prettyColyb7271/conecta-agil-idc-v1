"use client";

import { useState } from "react";
import { Dot, ESTATUS_LABEL, Panel, SmallButton } from "@/components/ui";
import { Estatus, GATES, metas, pendientesGestor as pendientesDemo, proyectos as proyectosDemo, tendencia } from "@/data/mock";

export type ProyectoTablero = { folio: string; proyecto: string; cliente: string; tramite: string; estatus: Estatus; gate: number };
export type PendienteTablero = { id: string; titulo: string; folio: string; urgente: boolean };

const FILTROS: { id: "todos" | Estatus; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "atrasado", label: "Atrasados" },
  { id: "riesgo", label: "Con riesgo" },
  { id: "entiempo", label: "En tiempo" },
];

// Sin props usa los datos de ejemplo de la demo; en modo local recibe expedientes y pendientes reales.
export default function GestorInicio({ proyectos = proyectosDemo, pendientes = pendientesDemo, datosReales = false }: { proyectos?: ProyectoTablero[]; pendientes?: PendienteTablero[]; datosReales?: boolean }) {
  const [filtro, setFiltro] = useState<"todos" | Estatus>("todos");
  const lista = proyectos.filter((p) => filtro === "todos" || p.estatus === filtro);
  const max = Math.max(...tendencia.map((t) => t.entiempo + t.riesgo + t.atrasado));

  return (
    <>
      <Panel title="Indicadores del reto (línea base y meta)">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metas.map((m) => (
            <div key={m.titulo} className="rounded-xl border-2 bg-white p-3" style={{ borderColor: m.color }}>
              <p className="text-sm font-bold leading-tight">{m.titulo}</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-2xl font-extrabold text-slate-500">{m.hoy}</span>
                <span aria-hidden className="pb-1 text-slate-400">→</span>
                <span className="text-3xl font-extrabold" style={{ color: m.color }}>{m.meta}</span>
              </div>
              <p className="text-[11px] text-slate-500">Hoy → Meta</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Comportamiento de trámites (datos ilustrativos)">
          <div
            role="img"
            aria-label="Gráfica de barras por semana con trámites en tiempo, con riesgo y atrasados. Los atrasados bajan de 2 en la semana 1 a 0 en la semana 6. Datos ilustrativos."
            className="flex h-40 items-end gap-3"
          >
            {tendencia.map((t) => {
              const total = t.entiempo + t.riesgo + t.atrasado;
              return (
                <div key={t.semana} className="flex h-full flex-1 flex-col justify-end">
                  <div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(total / max) * 100}%` }}>
                    <div className="bg-green-500" style={{ flex: t.entiempo }} />
                    <div className="bg-amber-400" style={{ flex: t.riesgo }} />
                    <div className="bg-red-500" style={{ flex: t.atrasado }} />
                  </div>
                  <span className="mt-1 text-center text-xs font-bold">{t.semana}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
            <span className="flex items-center gap-1"><Dot tipo="entiempo" /> En tiempo</span>
            <span className="flex items-center gap-1"><Dot tipo="riesgo" /> Con riesgo</span>
            <span className="flex items-center gap-1"><Dot tipo="atrasado" /> Atrasados</span>
          </div>
        </Panel>

        <Panel title="Pendientes prioritarios">
          {pendientes.length === 0 && <p className="text-sm">No hay pendientes prioritarios.</p>}
          <ul className="space-y-2">
            {pendientes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-bold">{p.titulo}</span>
                  <span className="block text-xs text-slate-600">{p.folio}</span>
                </span>
                {p.urgente && <span className="flex items-center gap-1 text-xs font-bold"><Dot tipo="urgente" /> Urgente</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title={datosReales ? "Proyectos" : "Proyectos (datos ilustrativos)"}>
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estatus">
          {FILTROS.map((f) => (
            <SmallButton key={f.id} active={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.label}</SmallButton>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs">
              <tr>
                <th className="py-1 pr-3">Folio</th><th className="pr-3">Proyecto / Cliente</th>
                <th className="pr-3">Trámite</th><th className="pr-3">Estatus</th><th>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.folio} className="border-t border-[#8fb0d1]">
                  <td className="py-2 pr-3 font-bold">{p.folio}</td>
                  <td className="pr-3"><span className="block font-bold">{p.proyecto}</span><span className="block text-xs text-slate-600">{p.cliente}</span></td>
                  <td className="pr-3">{p.tramite}</td>
                  <td className="pr-3"><span className="flex items-center gap-2 font-bold"><Dot tipo={p.estatus} />{ESTATUS_LABEL[p.estatus]}</span></td>
                  <td className="font-bold">Gate {p.gate} de {GATES.length}</td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-center text-sm">No hay proyectos con este estatus.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
