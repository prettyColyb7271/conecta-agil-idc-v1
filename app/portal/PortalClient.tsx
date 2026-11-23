"use client";

import { useState } from "react";
import { Dot, ESTATUS_LABEL, Panel, SmallButton } from "@/components/ui";
import { GATES, expediente, notificaciones, pendientes, procesos } from "@/data/mock";

export default function PortalInicio() {
  const [hechos, setHechos] = useState<string[]>([]);
  const [sel, setSel] = useState<string>(procesos[0].id);
  const proceso = procesos.find((p) => p.id === sel);

  return (
    <>
      {/* Expediente + indicadores */}
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_3fr]">
        <Panel title="Mi expediente">
          <p className="text-sm"><b>Folio:</b> {expediente.folio}</p>
          <p className="mt-2 text-sm"><b>Tipo de Trámite:</b></p>
          <p className="text-sm">{expediente.tramite}</p>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-3">
          {expediente.kpis.map((k) => (
            <div key={k.titulo} className="rounded-xl border-2 bg-white p-3 text-[#0d1f33]" style={{ borderColor: k.color }}>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full" style={{ background: k.color }} aria-hidden />
                <p className="text-sm font-bold leading-tight">{k.titulo}</p>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-extrabold">{k.valor}</span>
                <span className="pb-1 text-[11px] leading-tight text-slate-500">{k.nota}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Panel title="Notificaciones">
        {notificaciones.map((n) => (
          <div key={n.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{n.titulo}</p>
              <p className="text-xs text-slate-500">{n.archivo}</p>
            </div>
            <div className="flex items-center gap-3">
              {n.urgente && <span className="flex items-center gap-1 text-xs font-bold"><Dot tipo="urgente" /> Urgente</span>}
              <SmallButton>Ir</SmallButton>
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="Lista de pendientes">
        {pendientes.map((p) => {
          const hecho = hechos.includes(p.id);
          return (
            <label key={p.id} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={hecho}
                  onChange={() => setHechos(hecho ? hechos.filter((x) => x !== p.id) : [...hechos, p.id])}
                  className="h-4 w-4"
                />
                <span>
                  <span className={`block text-sm font-bold ${hecho ? "line-through opacity-60" : ""}`}>{p.titulo}</span>
                  <span className="block text-xs text-slate-500">{p.archivo}</span>
                </span>
              </span>
              <span className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1"><Dot tipo="urgente" /> Urgente<span className="ml-1 font-normal text-slate-500">{p.hora}</span></span>
                <SmallButton>Ir</SmallButton>
              </span>
            </label>
          );
        })}
      </Panel>

      <Panel title="Procesos">
        <div className="overflow-x-auto">
          <div className="min-w-[560px] space-y-2 text-sm">
            <div className="grid grid-cols-[2fr_1.2fr_1fr_auto] gap-3 text-xs font-bold">
              <span>Procesos</span><span>Estatus</span><span>Etapa</span><span>Avance</span>
            </div>
            {procesos.map((p) => (
              <div key={p.id} className="grid grid-cols-[2fr_1.2fr_1fr_auto] items-center gap-3">
                <span>
                  <span className="block font-bold">{p.nombre}</span>
                  <span className="block text-xs text-slate-500">{p.archivo}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Dot tipo={p.estatus} />
                  <span>
                    <span className="block font-bold">{ESTATUS_LABEL[p.estatus]}</span>
                    <span className="block text-xs text-slate-500">{p.detalle}</span>
                  </span>
                </span>
                <span className="font-bold">Gate {p.gate} de 5</span>
                <SmallButton active={sel === p.id} onClick={() => setSel(p.id)}>Más detalles</SmallButton>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Línea de gates del proceso seleccionado */}
      {proceso && (
        <section aria-label={`Etapas de ${proceso.nombre}`} className="rounded-sm bg-[#cfe0f1] px-3 py-4 text-[#0d1f33]">
          <p className="mb-3 text-center text-xs font-bold">{proceso.nombre}</p>
          <div className="relative mx-auto max-w-3xl">
            <div className="absolute left-[10%] right-[10%] top-6 h-1.5 bg-[#0d1f33]" aria-hidden />
            <ol className="relative grid grid-cols-5 text-center">
              {GATES.map((g) => (
                <li key={g.n} className="flex flex-col items-center">
                  <span
                    className={`h-12 w-12 rounded-full border-4 border-[#0d1f33] ${g.n <= proceso.gate ? "bg-[#5885b1]" : "bg-[#b6cde3]"}`}
                    aria-label={g.n <= proceso.gate ? "Etapa alcanzada" : "Etapa pendiente"}
                  />
                  <span className="mt-1 text-xs font-bold">Gate {g.n}</span>
                  <span className="text-[11px] leading-tight">{g.nombre}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}
