"use client";

import { useState } from "react";
import { Panel } from "@/components/ui";
import { CORREO_SOLICITUDES, tramites, usuariosIniciales } from "@/data/mock";

const inputCls =
  "w-full rounded border border-[#1b3d66] bg-white px-3 py-2 text-sm text-[#0d1f33] focus:outline-none focus:ring-2 focus:ring-sky-400";
const labelCls = "mb-1 block text-xs font-bold";

export default function AltaProyecto() {
  const [ok, setOk] = useState("");
  const gestoresCFE = usuariosIniciales.filter((u) => u.rol === "gestor_tramites_cfe");

  return (
    <Panel title="Registrar proyecto">
      <form
        className="mx-auto max-w-2xl space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const nombre = String(new FormData(e.currentTarget).get("nombre"));
          e.currentTarget.reset();
          // DEMO: aún no se guarda ni se envía; más adelante irá a la base de datos y a Zoho
          setOk(`Proyecto "${nombre}" registrado (demostración).`);
        }}
      >
        <div>
          <label htmlFor="nombre" className={labelCls}>Nombre del proyecto:</label>
          <input id="nombre" name="nombre" className={inputCls} placeholder="Nombre del proyecto" required />
        </div>
        <div>
          <label htmlFor="cliente" className={labelCls}>Usuario (razón social):</label>
          <input id="cliente" name="cliente" className={inputCls} placeholder="Razón social" required />
        </div>
        <div>
          <label htmlFor="tramite" className={labelCls}>Tipo de trámite:</label>
          <select id="tramite" name="tramite" className={inputCls} defaultValue="" required>
            <option value="" disabled>Selecciona un trámite</option>
            {tramites.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="gestorcfe" className={labelCls}>Asignar gestor CFE:</label>
          <select id="gestorcfe" name="gestorcfe" className={inputCls} defaultValue="" required>
            <option value="" disabled>Selecciona un gestor</option>
            {gestoresCFE.map((g) => <option key={g.id}>{g.nombre}</option>)}
          </select>
        </div>

        <p className="rounded bg-[#3d6a99] px-3 py-2 text-center text-xs text-white">
          La petición se enviará y será evaluada a <u>{CORREO_SOLICITUDES}</u> y dado de alta en la plataforma de Zoho.
        </p>

        <button className="rounded bg-[#0d1f33] px-5 py-2 text-sm font-semibold text-white hover:bg-[#16345a]">
          Enviar solicitud
        </button>
        {ok && <p role="status" className="text-sm font-bold text-emerald-800">{ok}</p>}
      </form>
    </Panel>
  );
}
