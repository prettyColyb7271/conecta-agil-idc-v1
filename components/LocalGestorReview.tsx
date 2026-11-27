"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, SmallButton } from "@/components/ui";
import { ETAPAS, REQUISITOS_POST_INSTALACION, REQUISITOS_PRE_FIRMA, esPostInstalacion } from "@/lib/etapas";
import { encabezadoGate, gateActual } from "@/lib/semaforo";

type Requirement = {
  requirement_code: string;
  name: string;
  status: string;
  tipo: string;
  integra: string;
  sensible: number;
  validaciones: string;
  document_id: string | null;
  version_id: string | null;
  versions: Array<{ id: string; version_number: number; original_filename: string; created_at: string; uploaded_by_current_user: number }>;
  observations: Array<{ visibility: string; body: string; created_at?: string }>;
};
type Pending = { kind: string; expedienteId: string; folio: string; requirementCode?: string; label: string };
type Gate = { gate_code: string; status: string };
type Expediente = { id: string; folio: string; cliente_nombre: string };
type Template = { id: string; code: string; version: number; sha256: string; active: number };
type Format = { document_id: string; document_type: string; status: string; version_id: string; version_number: number; original_filename: string };
type ExternalEvent = { event_type: string; document_id: string | null; description: string };
type Aviso = { ok: boolean; text: string };
type Firma = { fecha: string; lugar: string; solicitante: string; otorgante: string; apoderado: string; testigo1: string; testigo2: string; evidencia: File | null };
const firmaVacia = (): Firma => ({ fecha: "", lugar: "", solicitante: "", otorgante: "", apoderado: "", testigo1: "", testigo2: "", evidencia: null });
const FIRMAS = [{ formato: "F-01", requisito: "R01" }, { formato: "F-02", requisito: "R07" }] as const;
const FIRMANTES = [
  { campo: "solicitante", label: "Solicitante" }, { campo: "otorgante", label: "Otorgante" },
  { campo: "apoderado", label: "Apoderado" }, { campo: "testigo1", label: "Testigo 1" }, { campo: "testigo2", label: "Testigo 2" },
] as const;

function gatesCompletos(gates: Gate[] | undefined): gates is Gate[] {
  return Array.isArray(gates) && gates.length === ETAPAS.length && ETAPAS.every((etapa) => gates.some((gate) => gate.gate_code === etapa.code));
}

// Semáforo de cada requisito: gris = falta, ámbar = por revisar, rojo = observado, verde = listo, azul = formato.
const ESTADOS: Record<string, { label: string; color: string; grupo: "pendiente" | "revisar" | "observado" | "listo" }> = {
  requerido: { label: "Pendiente de carga", color: "#94a3b8", grupo: "pendiente" },
  en_captura: { label: "En captura", color: "#94a3b8", grupo: "pendiente" },
  cargado: { label: "Por revisar", color: "#f59e0b", grupo: "revisar" },
  en_revision_idc: { label: "Por revisar", color: "#f59e0b", grupo: "revisar" },
  escaneo_recibido: { label: "Escaneo por verificar", color: "#f59e0b", grupo: "revisar" },
  observado: { label: "Observado", color: "#ef4444", grupo: "observado" },
  invalidado_por_cambio: { label: "Invalidado por cambio", color: "#ef4444", grupo: "observado" },
  vencido: { label: "Vencido", color: "#ef4444", grupo: "observado" },
  validado_idc: { label: "Validado", color: "#22c55e", grupo: "listo" },
  escaneo_verificado_idc: { label: "Firmado y verificado", color: "#22c55e", grupo: "listo" },
  no_aplica_justificado: { label: "No aplica", color: "#22c55e", grupo: "listo" },
  pdf_generado: { label: "Formato generado", color: "#3b82f6", grupo: "revisar" },
  pendiente_firma_presencial: { label: "Pendiente de firma", color: "#f59e0b", grupo: "revisar" },
};
const estado = (status: string) => ESTADOS[status] ?? { label: status, color: "#94a3b8", grupo: "pendiente" as const };
const GATE_STATUS: Record<string, string> = { cerrado: "Cerrado", abierto: "Abierto", bloqueado: "Bloqueado", pendiente: "Pendiente", observado: "Observado" };

// Qué exige cada gate para cerrarse (resumen de lib/data/gates.ts).
const EXIGE: Record<string, { requisitos?: readonly string[]; evidencias?: string[] }> = {
  G0: { evidencias: ["Cliente, responsable IDC y aviso de privacidad aceptado"] },
  G1: { requisitos: REQUISITOS_PRE_FIRMA },
  G2: { evidencias: ["Escaneos firmados de R01 y R07 verificados", "Evidencia de la firma presencial"] },
  G3: { requisitos: REQUISITOS_POST_INSTALACION, evidencias: ["Acuse de CFE con medio y número de solicitud"] },
  G4: { evidencias: ["Oficio resolutivo con vigencia y resultado"] },
  G5: { evidencias: ["Contrato de interconexión firmado"] },
  G6: { requisitos: Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`), evidencias: ["Visita y certificado UIIE"] },
  G7: { evidencias: ["Medidor, interconexión, alta comercial y cierre", "Lo cierra un Gestor IDC distinto del responsable"] },
};

const FORMATOS = [
  { code: "F-01", nombre: "Solicitud de interconexión" },
  { code: "F-02", nombre: "Carta poder CFE" },
  { code: "F-03", nombre: "Carta poder UIIE" },
  { code: "F-04", nombre: "Ficha de datos" },
  { code: "F-05", nombre: "Memoria de cálculo" },
  { code: "F-06", nombre: "Carátula del expediente" },
];

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "revisar", label: "Por revisar" },
  { id: "observado", label: "Observados" },
  { id: "pendiente", label: "Pendientes" },
  { id: "listo", label: "Listos" },
] as const;

function Punto({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

export default function LocalGestorReview() {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [selId, setSelId] = useState<string>("");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [formats, setFormats] = useState<Format[]>([]);
  const [eventos, setEventos] = useState<ExternalEvent[]>([]);
  const [firma, setFirma] = useState<Firma>(firmaVacia);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [gateSel, setGateSel] = useState<string>("");
  const [grupo, setGrupo] = useState<"R" | "U">("R");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState<{ code: string; action: "observe" | "not_applicable"; reason: string; visibility: "cliente" | "interno_idc" } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [cargadoId, setCargadoId] = useState<string>("");
  const [estadoCarga, setEstadoCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [errorCarga, setErrorCarga] = useState<string>("");
  const filas = useRef<Record<string, HTMLElement | null>>({});
  const seleccionActual = useRef("");
  const solicitudDetalle = useRef(0);
  const firmaEnCurso = useRef(false);

  const notificar = (next: Aviso) => {
    setAviso(next);
    if (next.ok) window.setTimeout(() => setAviso((current) => (current === next ? null : current)), 7000);
  };

  const cargarDetalle = useCallback(async (id: string) => {
    if (!id || id !== seleccionActual.current) return;
    const solicitud = ++solicitudDetalle.current;
    setEstadoCarga("cargando");
    setErrorCarga("");
    try {
      const responses = await Promise.all([
        fetch(`/api/expedientes/${id}/requirements/R01`),
        fetch(`/api/expedientes/${id}/gates`),
        fetch(`/api/expedientes/${id}/formats`),
        fetch(`/api/expedientes/${id}`),
      ]);
      const [review, gateData, formatData, expedienteData] = await Promise.all(responses.map((response) => response.json())) as [
        { requirements?: Requirement[]; error?: string }, { gates?: Gate[]; error?: string }, { formats?: Format[]; error?: string },
        { expediente?: { external_events?: ExternalEvent[] }; error?: string },
      ];
      const bodies = [review, gateData, formatData, expedienteData];
      const fallo = responses.findIndex((response) => !response.ok);
      if (fallo !== -1) throw new Error(bodies[fallo].error ?? "No fue posible consultar el expediente.");
      if (!Array.isArray(review.requirements) || !Array.isArray(formatData.formats) || !Array.isArray(expedienteData.expediente?.external_events) || !gatesCompletos(gateData.gates)) {
        throw new Error("La respuesta del expediente está incompleta.");
      }
      if (solicitud !== solicitudDetalle.current || id !== seleccionActual.current) return;
      const nextGates = gateData.gates;
      setRequirements(review.requirements);
      setGates(nextGates);
      setFormats(formatData.formats);
      setEventos(expedienteData.expediente.external_events);
      setCargadoId(id);
      setGateSel((current) => current || ETAPAS[gateActual(nextGates) - 1].code);
      setEstadoCarga("listo");
    } catch (error) {
      if (solicitud !== solicitudDetalle.current || id !== seleccionActual.current) return;
      setCargadoId(id);
      setEstadoCarga("error");
      setErrorCarga(error instanceof Error ? error.message : "Error inesperado al consultar el expediente.");
    }
  }, []);

  const cargarPendientes = useCallback(async () => {
    const data = await fetch(`/api/gestor/pendientes?scope=${scope}`).then((response) => response.json()) as { pendientes?: Pending[] };
    setPending(data.pendientes ?? []);
  }, [scope]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const [list, templateData] = await Promise.all([
        fetch("/api/expedientes").then((response) => response.json()) as Promise<{ expedientes?: Expediente[] }>,
        fetch("/api/templates").then((response) => response.json()) as Promise<{ templates?: Template[] }>,
      ]);
      setExpedientes(list.expedientes ?? []);
      setSelId((current) => current || list.expedientes?.[0]?.id || "");
      setTemplates(templateData.templates ?? []);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    seleccionActual.current = selId;
    const timer = window.setTimeout(() => { void cargarDetalle(selId); }, 0);
    return () => window.clearTimeout(timer);
  }, [selId, cargarDetalle]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void cargarPendientes(); }, 0);
    return () => window.clearTimeout(timer);
  }, [cargarPendientes]);
  // Al llegar desde un pendiente: lleva la vista al requisito y lo resalta.
  useEffect(() => {
    if (!foco || cargadoId !== selId) return;
    const fila = filas.current[foco];
    if (!fila) return;
    const scroll = window.setTimeout(() => fila.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    const timer = window.setTimeout(() => setFoco(null), 3000);
    return () => { window.clearTimeout(scroll); window.clearTimeout(timer); };
  }, [foco, cargadoId, selId, requirements]);

  const expediente = expedientes.find((item) => item.id === selId) ?? null;

  async function refrescar() {
    await Promise.all([cargarDetalle(selId), cargarPendientes()]);
  }

  async function revisar(code: string, action: "validate" | "observe" | "not_applicable", reason?: string, visibility: "cliente" | "interno_idc" = "cliente") {
    setOcupado(code);
    try {
      const response = await fetch(`/api/expedientes/${selId}/requirements/${code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason, visibility }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      const verbo = action === "validate" ? "validado" : action === "observe" ? "observado" : "marcado como no aplica";
      notificar(response.ok ? { ok: true, text: `${code} ${verbo}.` } : { ok: false, text: body.error ?? "No fue posible actualizar." });
      if (response.ok) { setForm(null); await refrescar(); }
    } finally {
      setOcupado(null);
    }
  }

  async function respuesta<T>(response: Response): Promise<T> {
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}.`);
    return body;
  }

  async function marcarFirma(formatCode: string, versionId: string) {
    setOcupado(formatCode);
    try {
      await respuesta(await fetch(`/api/expedientes/${selId}/formats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "print", formatCode, versionId }),
      }));
      notificar({ ok: true, text: `${formatCode} marcado para firma.` });
      await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible marcar el formato." });
    } finally {
      setOcupado(null);
    }
  }

  async function subirEscaneo(requirementCode: string, sourceVersionId: string, file: File) {
    setOcupado(requirementCode);
    try {
      const data = new FormData();
      data.set("requirementCode", requirementCode);
      data.set("sourceVersionId", sourceVersionId);
      data.set("file", file);
      await respuesta(await fetch(`/api/expedientes/${selId}/documents`, { method: "POST", body: data }));
      notificar({ ok: true, text: `${requirementCode}: escaneo recibido. Lo verifica otro Gestor IDC.` });
      await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible subir el escaneo." });
    } finally {
      setOcupado(null);
    }
  }

  async function verificarEscaneo(requirementCode: string, versionId: string) {
    setOcupado(requirementCode);
    try {
      await respuesta(await fetch(`/api/expedientes/${selId}/requirements/${requirementCode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify_scan", versionId }),
      }));
      notificar({ ok: true, text: `${requirementCode}: escaneo verificado.` });
      await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible verificar el escaneo." });
    } finally {
      setOcupado(null);
    }
  }

  async function registrarFirma() {
    if (firmaEnCurso.current) return;
    if (!firma.evidencia) {
      notificar({ ok: false, text: "Selecciona la evidencia de la firma presencial." });
      return;
    }
    firmaEnCurso.current = true;
    setOcupado("firma");
    const firmantes = [
      `Solicitante: ${firma.solicitante.trim()}`, `Otorgante: ${firma.otorgante.trim()}`,
      `Apoderado: ${firma.apoderado.trim()}`, `Testigo 1: ${firma.testigo1.trim()}`, `Testigo 2: ${firma.testigo2.trim()}`,
    ];
    const description = "Firma presencial";
    const lugar = firma.lugar.trim();
    try {
      const data = new FormData();
      data.set("eventType", "firma_presencial");
      data.set("eventDate", firma.fecha);
      data.set("description", `${description} · Lugar: ${lugar} · Firmantes: ${firmantes.join(", ")}`);
      data.set("file", firma.evidencia);
      const uploaded = await respuesta<{ document: { documentId: string } }>(await fetch(`/api/expedientes/${selId}/documents`, { method: "POST", body: data }));
      await respuesta(await fetch(`/api/expedientes/${selId}/gates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "event", eventType: "firma_presencial", eventDate: firma.fecha, description, lugar, firmantes, documentId: uploaded.document.documentId }),
      }));
      setFirma(firmaVacia());
      notificar({ ok: true, text: "Firma presencial registrada." });
      await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible registrar la firma." });
      await cargarDetalle(selId);
    } finally {
      firmaEnCurso.current = false;
      setOcupado(null);
    }
  }

  async function subir(code: string, file: File) {
    setOcupado(code);
    try {
      const data = new FormData();
      data.set("requirementCode", code);
      data.set("file", file);
      const response = await fetch(`/api/expedientes/${selId}/documents`, { method: "POST", body: data });
      const body = await response.json().catch(() => ({})) as { error?: string };
      notificar(response.ok ? { ok: true, text: `${code}: documento cargado. Otro Gestor IDC debe validarlo.` } : { ok: false, text: body.error ?? "No fue posible cargar el documento." });
      if (response.ok) await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible cargar el documento." });
    } finally {
      setOcupado(null);
    }
  }

  async function cerrarGate(code: string) {
    const nombre = ETAPAS.find((etapa) => etapa.code === code)?.nombre ?? code;
    if (!window.confirm(`¿Cerrar ${code} · ${nombre}? Se abrirá el siguiente gate.`)) return;
    setOcupado(code);
    try {
      const response = await fetch(`/api/expedientes/${selId}/gates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "close", gateCode: code }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; gates?: Gate[] };
      if (selId !== seleccionActual.current) return;
      notificar(response.ok ? { ok: true, text: `${code} cerrado.` } : { ok: false, text: body.error ?? "No fue posible cerrar el gate." });
      if (response.ok) {
        if (!gatesCompletos(body.gates)) {
          notificar({ ok: false, text: "La respuesta del expediente está incompleta." });
          await cargarDetalle(selId);
          return;
        }
        const next = body.gates;
        setGates(next);
        setGateSel(ETAPAS[gateActual(next) - 1].code);
        await cargarPendientes();
      }
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible cerrar el gate." });
    } finally {
      setOcupado(null);
    }
  }

  async function generar(code: string) {
    setOcupado(code);
    try {
      const response = await fetch(`/api/expedientes/${selId}/formats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", formatCode: code }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      notificar(response.ok ? { ok: true, text: `${code} generado.` } : { ok: false, text: body.error ?? "No fue posible generar el formato." });
      if (response.ok) await cargarDetalle(selId);
    } finally {
      setOcupado(null);
    }
  }

  function irAPendiente(item: Pending) {
    if (item.expedienteId !== selId) seleccionarExpediente(item.expedienteId);
    if (item.requirementCode) {
      setGrupo(item.requirementCode.startsWith("U") ? "U" : "R");
      setFiltro("todos");
      setAbierto(item.requirementCode);
      setFoco(item.requirementCode);
    }
  }

  function seleccionarExpediente(id: string) {
    if (ocupado !== null) return;
    seleccionActual.current = id;
    solicitudDetalle.current += 1;
    setSelId(id);
    setGateSel("");
    setAbierto(null);
    setForm(null);
    setRequirements([]);
    setGates([]);
    setFormats([]);
    setEventos([]);
    setFirma(firmaVacia());
    setEstadoCarga("cargando");
  }

  if (!expedientes.length) return <Panel title="Revisión del expediente"><p className="text-sm">No hay expedientes para revisar.</p></Panel>;

  const gateIndex = (code: string) => ETAPAS.findIndex((etapa) => etapa.code === code);
  const avanceEstado = cargadoId === selId ? estadoCarga : "cargando";
  const statusGate = (code: string) => avanceEstado === "listo" ? gates.find((gate) => gate.gate_code === code)?.status ?? "bloqueado" : "bloqueado";
  const etapaSel = ETAPAS.find((etapa) => etapa.code === gateSel) ?? ETAPAS[0];
  const exige = EXIGE[etapaSel.code] ?? {};
  const g1Cerrado = statusGate("G1") === "cerrado";
  const delGrupo = requirements.filter((item) => item.requirement_code.startsWith(grupo));
  const listos = delGrupo.filter((item) => estado(item.status).grupo === "listo").length;
  const visibles = delGrupo.filter((item) => filtro === "todos" || estado(item.status).grupo === filtro);
  const cuenta = (id: (typeof FILTROS)[number]["id"]) => id === "todos" ? delGrupo.length : delGrupo.filter((item) => estado(item.status).grupo === id).length;
  const formato = (code: string) => formats.find((item) => item.document_type.includes(code));
  const firmaRegistrada = eventos.some((item) => item.event_type === "firma_presencial" && item.document_id &&
    ["Lugar:", "Solicitante:", "Otorgante:", "Apoderado:", "Testigo 1:", "Testigo 2:"].every((label) => item.description.includes(label)));
  const faltantesG2 = [
    ...FIRMAS.filter(({ requisito }) => requirements.find((item) => item.requirement_code === requisito)?.status !== "escaneo_verificado_idc").map(({ requisito }) => `Escaneo ${requisito} verificado`),
    ...(!firmaRegistrada ? ["Firma presencial registrada"] : []),
  ];
  const firmaCompleta = Boolean(firma.fecha && firma.lugar.trim() && firma.evidencia && FIRMANTES.every(({ campo }) => firma[campo].trim()));
  const plantillas = Array.from(new Set(templates.map((template) => template.code))).sort().map((code) => ({
    code,
    activa: templates.find((template) => template.code === code && template.active),
    anteriores: templates.filter((template) => template.code === code && !template.active),
  }));

  return (
    <>
      <Panel title="Revisión del expediente">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-xs font-bold">
            Expediente
            <select
              value={selId}
              disabled={ocupado !== null}
              onChange={(event) => seleccionarExpediente(event.target.value)}
              className="mt-1 block w-72 max-w-full rounded border border-[#1b3d66] bg-white px-2 py-1.5 text-sm font-normal text-[#0d1f33]"
            >
              {expedientes.map((item) => <option key={item.id} value={item.id}>{item.folio} · {item.cliente_nombre}</option>)}
            </select>
          </label>
          <p className="text-sm">
            <b>{expediente?.folio}</b> · Gate actual:{" "}
            <b>{encabezadoGate(gates, avanceEstado)}</b>
            {avanceEstado === "error" && <button type="button" className="ml-2 underline" onClick={() => void cargarDetalle(selId)}>Reintentar</button>}
          </p>
        </div>
        {avanceEstado === "error" && errorCarga && <p role="alert" className="mt-2 text-sm text-red-800">{errorCarga}</p>}
        {aviso && (
          <p role={aviso.ok ? "status" : "alert"} className={`mt-3 flex items-center gap-2 rounded px-3 py-2 text-sm font-bold ${aviso.ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"}`}>
            <Punto color={aviso.ok ? "#22c55e" : "#ef4444"} /> {aviso.text}
          </p>
        )}
      </Panel>

      {/* Línea de gates interactiva (mismo diseño que el portal del cliente) */}
      {avanceEstado === "listo" && <section aria-label="Gates del expediente" className="rounded-sm bg-[#cfe0f1] px-3 py-4 text-[#0d1f33]">
        <p className="mb-3 text-center text-xs font-bold">Gates del trámite · haz clic en uno para ver qué exige</p>
        <div className="relative mx-auto max-w-4xl">
          <div className="absolute left-[6%] right-[6%] top-6 hidden h-1.5 bg-[#0d1f33] sm:block" aria-hidden />
          <ol className="relative grid grid-cols-4 gap-y-3 text-center sm:grid-cols-8">
            {ETAPAS.map((etapa, index) => {
              const status = statusGate(etapa.code);
              const activo = gateSel === etapa.code;
              return (
                <li key={etapa.code}>
                  <button
                    onClick={() => setGateSel(etapa.code)}
                    aria-pressed={activo}
                    className="group flex w-full flex-col items-center"
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full border-4 text-lg font-black transition group-hover:scale-110 ${activo ? "border-[#10c98a]" : "border-[#0d1f33]"} ${status === "cerrado" ? "bg-[#5885b1] text-white" : status === "abierto" ? "animate-pulse bg-[#10c98a] text-[#0d1f33]" : "bg-[#b6cde3] text-[#5885b1]"}`}>
                      {status === "cerrado" ? "✓" : ""}
                    </span>
                    <span className="mt-1 text-xs font-bold">Gate {index + 1}</span>
                    <span className="text-[11px] leading-tight">{etapa.nombre}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mx-auto mt-4 max-w-4xl rounded-sm bg-[#b6cde3] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Gate {gateIndex(etapaSel.code) + 1} · {etapaSel.code} · {etapaSel.nombre}</p>
              <p className="text-xs text-slate-700">{etapaSel.pasos} · {etapaSel.descripcion}</p>
            </div>
            <span className="flex items-center gap-2 text-xs font-bold">
              <Punto color={statusGate(etapaSel.code) === "cerrado" ? "#22c55e" : statusGate(etapaSel.code) === "abierto" ? "#f59e0b" : "#94a3b8"} />
              {GATE_STATUS[statusGate(etapaSel.code)] ?? statusGate(etapaSel.code)}
            </span>
          </div>
          {exige.requisitos && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exige.requisitos.map((code) => {
                const req = requirements.find((item) => item.requirement_code === code);
                const info = estado(req?.status ?? "requerido");
                return (
                  <button
                    key={code}
                    title={`${req?.name ?? code} · ${info.label}`}
                    onClick={() => { setGrupo(code.startsWith("U") ? "U" : "R"); setFiltro("todos"); setAbierto(code); setFoco(code); }}
                    className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-bold hover:ring-2 hover:ring-[#5885b1]"
                  >
                    <Punto color={info.color} /> {code}
                  </button>
                );
              })}
            </div>
          )}
          {exige.evidencias && <ul className="mt-2 list-inside list-disc text-xs">{exige.evidencias.map((item) => <li key={item}>{item}</li>)}</ul>}
          {etapaSel.code === "G2" && (
            <div className="mt-4 space-y-3 rounded bg-white p-3">
              <p className="text-sm font-bold">Firma presencial y escaneos</p>
              {!g1Cerrado && <p className="text-xs">Disponible después de cerrar G1.</p>}
              {g1Cerrado && FIRMAS.map(({ formato: formatCode, requisito }) => {
                const doc = formato(formatCode);
                const req = requirements.find((item) => item.requirement_code === requisito);
                const ultima = req?.versions[0];
                const pendiente = statusGate("G2") === "abierto";
                return (
                  <div key={formatCode} className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#cfe0f1] p-2 text-xs">
                    <span><b>{formatCode} · {requisito}</b> · {req ? estado(req.status).label : "Sin requisito"}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {pendiente && doc && req?.status === "pdf_generado" && (
                        <button type="button" disabled={ocupado !== null} onClick={() => void marcarFirma(formatCode, doc.version_id)} className="rounded bg-[#0d1f33] px-3 py-1 font-semibold text-white disabled:opacity-50">Marcar para firma</button>
                      )}
                      {pendiente && req?.status === "pendiente_firma_presencial" && req.version_id && (
                        <label className="cursor-pointer rounded bg-[#5885b1] px-3 py-1 font-semibold text-white focus-within:ring-2 focus-within:ring-sky-400">
                          Subir escaneo firmado
                          <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-label={`Subir escaneo firmado ${requisito}`} disabled={ocupado !== null}
                            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file && req.version_id) void subirEscaneo(requisito, req.version_id, file); }} />
                        </label>
                      )}
                      {pendiente && req?.status === "escaneo_recibido" && ultima && (
                        <button type="button" disabled={ocupado !== null || ultima.uploaded_by_current_user !== 0} onClick={() => void verificarEscaneo(requisito, ultima.id)} className="rounded bg-emerald-600 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                          {ultima.uploaded_by_current_user === 1 ? "Lo verifica otro Gestor IDC" : ultima.uploaded_by_current_user === 0 ? "Verificar escaneo" : "No se pudo identificar al cargador"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {g1Cerrado && statusGate("G2") === "abierto" && !firmaRegistrada && (
                <form className="grid gap-2 rounded bg-[#cfe0f1] p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (firmaCompleta) void registrarFirma(); }}>
                  <p className="text-xs font-bold sm:col-span-2">Registrar firma presencial</p>
                  <label className="text-xs font-bold">Fecha<input required type="date" value={firma.fecha} onChange={(event) => setFirma({ ...firma, fecha: event.target.value })} className="mt-1 block w-full rounded border border-[#1b3d66] bg-white px-2 py-1 font-normal" /></label>
                  <label className="text-xs font-bold">Lugar<input required value={firma.lugar} onChange={(event) => setFirma({ ...firma, lugar: event.target.value })} className="mt-1 block w-full rounded border border-[#1b3d66] bg-white px-2 py-1 font-normal" /></label>
                  {FIRMANTES.map(({ campo, label }) => (
                    <label key={campo} className="text-xs font-bold">{label}<input required value={firma[campo]} onChange={(event) => setFirma({ ...firma, [campo]: event.target.value })} className="mt-1 block w-full rounded border border-[#1b3d66] bg-white px-2 py-1 font-normal" /></label>
                  ))}
                  <label className="text-xs font-bold">Foto o PDF de evidencia<input required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setFirma({ ...firma, evidencia: event.target.files?.[0] ?? null })} className="mt-1 block w-full font-normal" /></label>
                  <div className="sm:col-span-2"><button type="submit" disabled={!firmaCompleta || ocupado !== null} className="rounded bg-[#0d1f33] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{ocupado === "firma" ? "Registrando…" : "Registrar firma presencial"}</button></div>
                </form>
              )}
              <div className="text-xs">
                <p className="font-bold">Qué falta para cerrar G2</p>
                {faltantesG2.length ? <ul className="list-inside list-disc">{faltantesG2.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No falta nada.</p>}
              </div>
            </div>
          )}
          {statusGate(etapaSel.code) === "abierto" && (
            <button
              disabled={ocupado !== null || (etapaSel.code === "G2" && faltantesG2.length > 0)}
              onClick={() => void cerrarGate(etapaSel.code)}
              className="mt-3 rounded bg-[#0d1f33] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#16345a] disabled:opacity-60"
            >
              {ocupado === etapaSel.code ? "Cerrando…" : `Cerrar ${etapaSel.code}`}
            </button>
          )}
        </div>
      </section>}

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Mis pendientes">
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Filtrar pendientes">
            <SmallButton active={scope === "all"} onClick={() => setScope("all")}>Todos</SmallButton>
            <SmallButton active={scope === "mine"} onClick={() => setScope("mine")}>Míos</SmallButton>
          </div>
          {pending.length === 0 && <p className="text-sm">No hay pendientes en este filtro.</p>}
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {pending.map((item, index) => (
              <li key={`${item.kind}-${item.expedienteId}-${item.requirementCode ?? index}`} className="flex items-center justify-between gap-3">
                <span className="flex items-start gap-2">
                  <span className="mt-1"><Punto color={item.kind === "observado" ? "#ef4444" : item.kind === "listo_g1" ? "#22c55e" : "#f59e0b"} /></span>
                  <span>
                    <span className="block text-sm font-bold">{item.label}</span>
                    <span className="block text-xs text-slate-600">{item.folio}</span>
                  </span>
                </span>
                <SmallButton onClick={() => irAPendiente(item)}>Ir</SmallButton>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Formatos del expediente">
          {!g1Cerrado && <p className="mb-2 text-xs font-bold text-slate-700">Se generan con los datos capturados al cerrar G1 (listo para firma).</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMATOS.map((f) => {
              const doc = formato(f.code);
              return (
                <div key={f.code} className="flex items-center justify-between gap-2 rounded bg-[#cfe0f1] px-2 py-1.5">
                  <span>
                    <span className="block text-sm font-bold">{f.code} · {f.nombre}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-600"><Punto color={doc ? "#22c55e" : "#94a3b8"} />{doc ? `v${doc.version_number} generado` : "Sin generar"}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {doc && <a href={`/api/documents/${doc.document_id}`} className="rounded bg-[#0d1f33] px-2 py-1 text-xs font-semibold text-white hover:bg-[#16345a]">Descargar</a>}
                    <button
                      disabled={!g1Cerrado || ocupado === f.code}
                      title={g1Cerrado ? undefined : "Disponible al cerrar G1"}
                      onClick={() => void generar(f.code)}
                      className="rounded bg-[#5885b1] px-2 py-1 text-xs font-semibold text-white hover:bg-[#3d6a99] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ocupado === f.code ? "…" : doc ? "Regenerar" : "Generar"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Requisitos del expediente">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2" role="group" aria-label="Lista de requisitos">
            <SmallButton active={grupo === "R"} onClick={() => { setGrupo("R"); setFiltro("todos"); }}>CFE (R01–R11)</SmallButton>
            <SmallButton active={grupo === "U"} onClick={() => { setGrupo("U"); setFiltro("todos"); }}>UIIE (U01–U17)</SmallButton>
          </div>
          <p className="text-sm font-bold">{listos} de {delGrupo.length} listos</p>
        </div>
        <div className="my-2 h-4 overflow-hidden rounded bg-[#0d1f33]" role="progressbar" aria-valuenow={listos} aria-valuemin={0} aria-valuemax={delGrupo.length} aria-label="Requisitos listos">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${delGrupo.length ? (listos / delGrupo.length) * 100 : 0}%` }} />
        </div>
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => <SmallButton key={f.id} active={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.label} ({cuenta(f.id)})</SmallButton>)}
        </div>

        {visibles.length === 0 && <p className="text-sm">No hay requisitos con este estado.</p>}
        <ul className="space-y-2">
          {visibles.map((item) => {
            const info = estado(item.status);
            const expandido = abierto === item.requirement_code;
            const editando = form?.code === item.requirement_code ? form : null;
            const ultima = item.versions[0];
            return (
              <li
                key={item.requirement_code}
                ref={(node) => { filas.current[item.requirement_code] = node; }}
                className={`rounded bg-[#cfe0f1] px-3 py-2 transition ${foco === item.requirement_code ? "ring-4 ring-[#10c98a]" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => setAbierto(expandido ? null : item.requirement_code)} aria-expanded={expandido}>
                    <Punto color={info.color} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{item.requirement_code} · {item.name}</span>
                      <span className="block text-xs text-slate-600">{info.label}{ultima ? ` · v${ultima.version_number} ${ultima.original_filename}` : ""}{item.sensible ? " · Sensible" : ""}</span>
                    </span>
                  </button>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {item.document_id && <a href={`/api/documents/${item.document_id}`} className="rounded bg-[#0d1f33] px-2 py-1 text-xs font-semibold text-white hover:bg-[#16345a]">Ver</a>}
                    <label className="cursor-pointer rounded bg-[#5885b1] px-2 py-1 text-xs font-semibold text-white hover:bg-[#3d6a99] focus-within:ring-2 focus-within:ring-sky-400">
                      {item.document_id ? "Reemplazar" : "Subir"}
                      <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-label={`Subir ${item.requirement_code}`} disabled={ocupado !== null}
                        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void subir(item.requirement_code, file); }} />
                    </label>
                    <button disabled={ocupado !== null} onClick={() => void revisar(item.requirement_code, "validate")} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Validar</button>
                    <button disabled={ocupado !== null} onClick={() => setForm({ code: item.requirement_code, action: "observe", reason: "", visibility: "cliente" })} className="rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50">Observar</button>
                    <button disabled={ocupado !== null} onClick={() => setForm({ code: item.requirement_code, action: "not_applicable", reason: "", visibility: "cliente" })} className="rounded bg-slate-500 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50">No aplica</button>
                    <button onClick={() => setAbierto(expandido ? null : item.requirement_code)} className="px-1 text-sm font-bold" aria-label={expandido ? "Ocultar detalles" : "Ver detalles"}>{expandido ? "▴" : "▾"}</button>
                  </span>
                </div>

                {editando && (
                  <form
                    className="mt-2 rounded bg-white p-2"
                    onSubmit={(event) => { event.preventDefault(); if (editando.reason.trim()) void revisar(editando.code, editando.action, editando.reason.trim(), editando.visibility); }}
                  >
                    <label className="block text-xs font-bold">
                      {editando.action === "observe" ? "¿Qué debe corregirse?" : "¿Por qué no aplica?"}
                      <textarea
                        autoFocus
                        required
                        rows={2}
                        value={editando.reason}
                        onChange={(event) => setForm({ ...editando, reason: event.target.value })}
                        className="mt-1 w-full rounded border border-[#1b3d66] px-2 py-1 text-sm font-normal"
                      />
                    </label>
                    {editando.action === "observe" && (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        <label className="flex items-center gap-1"><input type="radio" checked={editando.visibility === "cliente"} onChange={() => setForm({ ...editando, visibility: "cliente" })} /> Visible para el cliente</label>
                        <label className="flex items-center gap-1"><input type="radio" checked={editando.visibility === "interno_idc"} onChange={() => setForm({ ...editando, visibility: "interno_idc" })} /> Nota interna IDC</label>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button type="submit" disabled={!editando.reason.trim() || ocupado !== null} className="rounded bg-[#0d1f33] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setForm(null)} className="rounded bg-slate-300 px-3 py-1 text-xs font-semibold">Cancelar</button>
                    </div>
                  </form>
                )}

                {expandido && (
                  <div className="mt-2 grid gap-2 border-t border-[#8fb0d1] pt-2 text-xs sm:grid-cols-2">
                    <div>
                      <p><b>Checklist:</b> {item.validaciones}</p>
                      <p className="mt-1"><b>Integra:</b> {item.integra} · <b>Tipo:</b> {item.tipo} · <b>Sensible:</b> {item.sensible ? "sí" : "no"}</p>
                      {esPostInstalacion(item.requirement_code) && <p className="mt-1 font-semibold text-sky-900">Se carga después de instalar; se exige al cerrar G3 (ingreso a CFE), no para la cita de firma.</p>}
                    </div>
                    <div>
                      <p className="font-bold">Versiones</p>
                      {item.versions.length === 0 && <p className="text-slate-600">Sin documentos cargados.</p>}
                      <ul>{item.versions.slice(0, 4).map((version) => <li key={version.id}>v{version.version_number} · {version.original_filename} · {new Date(version.created_at).toLocaleDateString("es-MX")}</li>)}</ul>
                      {item.observations.length > 0 && <p className="mt-1 font-bold">Observaciones</p>}
                      {item.observations.map((observation, index) => (
                        <p key={index} className={observation.visibility === "cliente" ? "text-red-700" : "text-slate-700"}>
                          {observation.visibility === "cliente" ? "Al cliente" : "Interna"}: {observation.body}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Plantillas Word IDC">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-700">DOCX sin macros · máximo 5 MB · versión activa y hash verificable.</p>
          <SmallButton active={verHistorial} onClick={() => setVerHistorial(!verHistorial)}>{verHistorial ? "Ocultar versiones anteriores" : "Ver versiones anteriores"}</SmallButton>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plantillas.map((plantilla) => (
            <div key={plantilla.code} className="rounded bg-[#cfe0f1] px-2 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="block text-sm font-bold">{plantilla.code} · {FORMATOS.find((f) => f.code === plantilla.code)?.nombre}</span>
                  {plantilla.activa
                    ? <span className="flex items-center gap-1 text-slate-600"><Punto color="#22c55e" /> v{plantilla.activa.version} activa · <code>{plantilla.activa.sha256.slice(0, 10)}</code></span>
                    : <span className="text-slate-600">Sin versión activa</span>}
                </span>
                {plantilla.activa && <a href={`/api/templates/${plantilla.activa.id}`} className="rounded bg-[#5885b1] px-2 py-1 font-semibold text-white hover:bg-[#3d6a99]">Descargar</a>}
              </div>
              {verHistorial && plantilla.anteriores.map((template) => (
                <p key={template.id} className="mt-1 flex items-center justify-between gap-2 border-t border-[#8fb0d1] pt-1 text-slate-600">
                  <span>v{template.version} inactiva · <code>{template.sha256.slice(0, 10)}</code></span>
                  <a href={`/api/templates/${template.id}`} className="underline">Descargar</a>
                </p>
              ))}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
