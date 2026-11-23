"use client";

import Image from "next/image";
import { useState, ReactNode } from "react";
import { usePrefs, Lang } from "./prefs";

const NAVY = "#1b3d66";
const SKY = "#d3e4f5";

export const inputCls =
  "w-full rounded-md border border-[#1b3d66] bg-white px-3 py-2 text-center text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400";

// Versión más grande para el inicio de sesión
export const inputLgCls = 
  "w-full rounded-md border border-[#1b3d66] bg-white px-3 py-3 text-center text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400";

export default function AuthShell({ children, logo = "/logo_blanco_1.png" }: { children: ReactNode; logo?: string }) {
  const { dark, lang, t, apply } = usePrefs();
  const [open, setOpen] = useState(false);
  const [dDark, setDDark] = useState(dark);
  const [dLang, setDLang] = useState<Lang>(lang);

  // Modo oscuro: izquierda azul fuerte -> derecha azul claro. Modo claro: al revés.
  const from = dark ? NAVY : SKY;
  const to = dark ? SKY : NAVY;
  const leftText = dark ? "text-slate-200" : "text-[#1b3d66]";
  const rightText = dark ? "text-[#1b3d66]" : "text-white";

  return (
    <main
      className="relative min-h-screen bg-[linear-gradient(to_bottom,var(--a),var(--b))] md:bg-[linear-gradient(to_right,var(--a)_35%,var(--b)_85%)]"
      style={{ ["--a" as string]: from, ["--b" as string]: to }}
    >
      {/* Menú de preferencias */}
      <div className="absolute left-4 top-4 z-10">
        <button
          aria-label={t.settings}
          onClick={() => {
            setDDark(dark);
            setDLang(lang);
            setOpen(!open);
          }}
          className="flex flex-col gap-1 rounded p-1 focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-slate-400" />
          ))}
        </button>

        {open && (
          <div className="mt-2 w-48 rounded-md bg-white/90 p-3 text-sm text-slate-800 shadow-lg">
            <label className="block text-xs font-bold">{t.language}:</label>
            <select
              value={dLang}
              onChange={(e) => setDLang(e.target.value as Lang)}
              className="mb-2 w-full rounded border border-[#1b3d66] bg-white px-2 py-1"
            >
              <option value="es">Español (MEX)</option>
              <option value="en">English</option>
            </select>

            <span className="block text-xs font-bold">{t.mode}:</span>
            <div className="mb-3 grid grid-cols-2 overflow-hidden rounded border border-[#1b3d66]">
              <button
                onClick={() => setDDark(false)}
                className={`py-1 text-xs font-bold ${!dDark ? "bg-[#3d6a99] text-white" : "bg-white"}`}
              >
                {t.light}
              </button>
              <button
                onClick={() => setDDark(true)}
                className={`py-1 text-xs font-bold ${dDark ? "bg-[#3d6a99] text-white" : "bg-white"}`}
              >
                {t.dark}
              </button>
            </div>

            <div className="flex justify-between gap-2">
              <button
                onClick={() => {
                  apply(dDark, dLang);
                  setOpen(false);
                }}
                className="flex-1 rounded bg-green-300 py-1 text-xs font-bold"
              >
                {t.save}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded bg-red-300 py-1 text-xs font-bold"
              >
                {t.exit}
              </button>
            </div>
          </div>
        )}
      </div>

      <h1 className={`absolute left-12 top-3 text-2xl font-extrabold tracking-wide md:left-14 md:text-3xl ${leftText}`}>
        CONECTA ÁGIL
      </h1>

      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-6 pb-12 pt-20 md:grid-cols-2 md:gap-20 md:px-10 lg:gap-32 md:py-0">
        {/* Izquierda: logo sobre una placa blanca para que se vea en modo claro y oscuro */}
        <section className="flex justify-center">
          <div className="p-6">
            <Image
              src={dark ? logo : "/logo_negro.png"}
              alt="IDC Sistemas Eléctricos"
              width={384}
              height={183}
              priority
              className="h-auto w-72 md:w-96"
            />
          </div>
        </section>

        {/* Derecha: formulario */}
        <section className={`flex flex-col items-center ${rightText}`}>{children}</section>
      </div>
    </main>
  );
}
