import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import PrivacyNoticeMarkdown from "@/components/PrivacyNoticeMarkdown";
import { AVISO_ES_BORRADOR, AVISO_FECHA, AVISO_VERSION } from "@/lib/privacidad";

export const metadata = {
  title: "Aviso de privacidad | Conecta Ágil",
};

export default function PrivacidadPage() {
  const source = fs.readFileSync(path.join(process.cwd(), "content", "aviso-privacidad.md"), "utf8");

  return (
    <main className="min-h-screen bg-[#dbe8f5] text-[#0d1f33]">
      {AVISO_ES_BORRADOR && (
        <div role="status" className="sticky top-0 z-10 border-b border-amber-400 bg-amber-100 px-4 py-3 text-center text-sm font-bold text-amber-950">
          Versión preliminar en revisión por IDC. No usar con clientes reales todavía.
        </div>
      )}
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Versión {AVISO_VERSION} · {AVISO_FECHA}</p>
          <Link href="/" className="rounded bg-[#0d1f33] px-3 py-2 text-sm font-semibold text-white underline">Volver al inicio</Link>
        </div>
        <article className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-7">
          <PrivacyNoticeMarkdown source={source} />
        </article>
      </div>
    </main>
  );
}
