"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { DataTable, EmptyState, MessageBox, PageHeading, Panel, SmallButton, StatusBadge } from "@/components/ui";
import type { SafeMetadataItem } from "@/lib/admin/access-log";

type EventRow = {
  id: string;
  createdAt: string;
  user: string;
  role: string;
  event: string;
  eventType?: string;
  date?: string;
  entity: string;
  metadata: SafeMetadataItem[];
  folio?: string | null;
};
type FilterUser = { id: string; label: string };
export type AccessLogFilters = { from: string; to: string; userId: string; eventType: string; folio: string; eventIds: string };
type Filters = AccessLogFilters;
type DemoAccessLog = { events: EventRow[]; users: FilterUser[]; eventTypes: Array<{ value: string; label: string }> };
type AccessResponse = DemoAccessLog & { page: number; pages: number; total: number; error?: string };

const EMPTY_FILTERS: Filters = { from: "", to: "", userId: "", eventType: "", folio: "", eventIds: "" };

const DEMO_DATA: DemoAccessLog = {
  users: [{ id: "demo-admin", label: "Administración de ejemplo" }],
  eventTypes: [{ value: "login_ok", label: "Inicio de sesión" }, { value: "mfa_fallido", label: "Código MFA incorrecto" }],
  events: [
    { id: "demo-1", createdAt: "27/11/2026 10:15", date: "2026-11-27", eventType: "login_ok", user: "Administración de ejemplo", role: "Administración de seguridad", event: "Inicio de sesión", entity: "sesión", metadata: [] },
    { id: "demo-2", createdAt: "27/11/2026 10:18", date: "2026-11-27", eventType: "mfa_fallido", user: "Administración de ejemplo", role: "Administración de seguridad", event: "Código MFA incorrecto", entity: "autenticación", metadata: [{ label: "MFA", value: "No" }] },
  ],
};

function requestUrl(filters: Filters, page: number) {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.folio) params.set("folio", filters.folio);
  if (filters.eventIds) params.set("eventIds", filters.eventIds);
  return `/api/admin/access?${params}`;
}

export default function AccessLog({ mode, initialFilters = EMPTY_FILTERS }: { mode: "demo" | "local"; initialFilters?: AccessLogFilters }) {
  const demo = mode === "demo";
  const { from: initialFrom, to: initialTo, userId: initialUserId, eventType: initialEventType, folio: initialFolio, eventIds: initialEventIds } = initialFilters;
  const [events, setEvents] = useState<EventRow[]>(demo ? DEMO_DATA.events : []);
  const [users, setUsers] = useState<FilterUser[]>(demo ? DEMO_DATA.users : []);
  const [eventTypes, setEventTypes] = useState(demo ? DEMO_DATA.eventTypes : []);
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, ...initialFilters }));
  const [applied, setApplied] = useState<Filters>(() => ({ ...EMPTY_FILTERS, ...initialFilters }));
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(demo ? 1 : 0);
  const [total, setTotal] = useState(demo ? DEMO_DATA.events.length : 0);
  const [loading, setLoading] = useState(!demo);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);

  const load = useCallback(async (nextPage: number, nextFilters: Filters) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(requestUrl(nextFilters, nextPage));
      const data = await response.json() as AccessResponse;
      if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la bitácora.");
      setEvents(data.events);
      setUsers(data.users);
      setEventTypes(data.eventTypes);
      setPage(data.page);
      setPages(data.pages);
      setTotal(data.total);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo cargar la bitácora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (demo) return;
    const timer = window.setTimeout(() => {
      void load(1, {
        from: initialFrom,
        to: initialTo,
        userId: initialUserId,
        eventType: initialEventType,
        folio: initialFolio,
        eventIds: initialEventIds,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [demo, load, initialFrom, initialTo, initialUserId, initialEventType, initialFolio, initialEventIds]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(filters);
    setPage(1);
    if (demo) {
      const filtered = DEMO_DATA.events.filter((row) =>
        (!filters.from || (row.date ?? "") >= filters.from) &&
        (!filters.to || (row.date ?? "") <= filters.to) &&
        (!filters.userId || filters.userId === "demo-admin") &&
        (!filters.eventType || filters.eventType === row.eventType) &&
        (!filters.folio || filters.folio === row.folio),
      );
      setEvents(filtered);
      setTotal(filtered.length);
      return;
    }
    void load(1, filters);
  }

  async function exportCsv() {
    if (demo) return;
    setExporting(true);
    setMessage("");
    try {
      const response = await fetch(requestUrl(applied, 1).replace("?", "?format=csv&"));
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "No se pudo exportar la bitácora.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "bitacora-accesos.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "No se pudo exportar la bitácora.");
    } finally {
      setExporting(false);
    }
  }

  const columns = [
    { key: "createdAt", label: "Fecha y hora", render: (row: EventRow) => row.createdAt },
    { key: "user", label: "Usuario", render: (row: EventRow) => row.user || "Sistema" },
    { key: "role", label: "Rol", render: (row: EventRow) => row.role || "—" },
    { key: "event", label: "Evento", render: (row: EventRow) => (
      <button type="button" className="text-left" onClick={() => setSelectedEvent(row)} aria-label={`Ver detalle: ${row.event}`}>
        <StatusBadge title={row.eventType}>{row.event}</StatusBadge>
      </button>
    ) },
    { key: "folio", label: "Folio", render: (row: EventRow) => row.folio ?? "—" },
    { key: "entity", label: "Entidad", render: (row: EventRow) => row.entity || "—" },
    { key: "metadata", label: "Metadatos permitidos", render: (row: EventRow) => row.metadata.length
      ? <ul className="space-y-1">{row.metadata.map((item) => <li key={item.label}><strong>{item.label}:</strong> {item.value}</li>)}</ul>
      : "—" },
  ];

  return (
    <div className="space-y-4">
      <PageHeading
        title="Auditoría"
        description="Los correos de intentos fallidos se muestran enmascarados y las IP truncadas; no se muestran user-agent, tokens ni contenido de expedientes."
        badge={demo && <StatusBadge tone="info">Ejemplo</StatusBadge>}
      />
      {message && <MessageBox tone="error">{message}</MessageBox>}
      <Panel title="Filtros y exportación">
        <form onSubmit={applyFilters} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="text-sm font-semibold">Desde
            <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="mt-1 w-full rounded border bg-white p-2 font-normal" />
          </label>
          <label className="text-sm font-semibold">Hasta
            <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="mt-1 w-full rounded border bg-white p-2 font-normal" />
          </label>
          <label className="text-sm font-semibold">Usuario
            <select value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })} className="mt-1 w-full rounded border bg-white p-2 font-normal">
              <option value="">Todos</option>{users.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Evento
            <select value={filters.eventType} onChange={(event) => setFilters({ ...filters, eventType: event.target.value })} className="mt-1 w-full rounded border bg-white p-2 font-normal">
              <option value="">Todos</option>{eventTypes.map((event) => <option key={event.value} value={event.value}>{event.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Folio de expediente
            <input value={filters.folio} onChange={(event) => setFilters({ ...filters, folio: event.target.value })} maxLength={64} className="mt-1 w-full rounded border bg-white p-2 font-normal" />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <SmallButton type="submit" disabled={loading}>Filtrar</SmallButton>
            <SmallButton onClick={() => void exportCsv()} disabled={demo || exporting || loading}>{exporting ? "Exportando…" : "Exportar CSV"}</SmallButton>
            {(applied.eventIds || applied.folio) && (
              <SmallButton onClick={() => {
                setFilters(EMPTY_FILTERS);
                setApplied(EMPTY_FILTERS);
                setPage(1);
                if (!demo) void load(1, EMPTY_FILTERS);
                else { setEvents(DEMO_DATA.events); setTotal(DEMO_DATA.events.length); }
              }}>Limpiar filtro</SmallButton>
            )}
          </div>
        </form>
        {demo && <p className="mt-3 text-xs text-slate-600">El CSV solo está disponible con registros locales reales.</p>}
        {applied.eventIds && <p className="mt-3 text-xs font-semibold">Filtro exacto de eventos de una alerta.</p>}
      </Panel>
      <Panel title={`Registros (${total}) · máximo 50 por página`}>
        {loading ? <MessageBox>Cargando bitácora…</MessageBox> : events.length ? (
          <DataTable
            ariaLabel="Bitácora de accesos"
            columns={columns}
            rows={events.map((event) => ({ key: event.id, value: event }))}
            emptyMessage="No hay eventos con esos filtros."
            minWidth="min-w-[760px]"
          />
        ) : <EmptyState>No hay eventos con esos filtros.</EmptyState>}
        {!demo && pages > 1 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <SmallButton disabled={loading || page <= 1} onClick={() => void load(page - 1, applied)}>Anterior</SmallButton>
              <SmallButton disabled={loading || page >= pages} onClick={() => void load(page + 1, applied)}>Siguiente</SmallButton>
            </div>
          </div>
        )}
      </Panel>
      {selectedEvent && (
        <aside role="dialog" aria-modal="true" aria-label="Detalle del evento" className="fixed inset-y-0 right-0 z-20 w-full max-w-lg overflow-y-auto border-l border-slate-300 bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Detalle de auditoría</h2>
              <p className="mt-1 text-sm">{selectedEvent.event}</p>
            </div>
            <SmallButton onClick={() => setSelectedEvent(null)}>Cerrar</SmallButton>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="font-semibold">Fecha y hora</dt><dd>{selectedEvent.createdAt}</dd></div>
            <div><dt className="font-semibold">Quién</dt><dd>{selectedEvent.user} · {selectedEvent.role}</dd></div>
            <div><dt className="font-semibold">Tipo</dt><dd>{selectedEvent.eventType ?? selectedEvent.event}</dd></div>
            <div><dt className="font-semibold">Entidad</dt><dd>{selectedEvent.entity}</dd></div>
            {selectedEvent.folio && <div><dt className="font-semibold">Folio</dt><dd>{selectedEvent.folio}</dd></div>}
            <div>
              <dt className="font-semibold">Metadatos permitidos</dt>
              <dd>{selectedEvent.metadata.length
                ? <ul className="mt-1 space-y-1">{selectedEvent.metadata.map((item) => <li key={item.label}><strong>{item.label}:</strong> {item.value}</li>)}</ul>
                : "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-600">El detalle muestra solo metadatos permitidos; no incluye contenido del expediente.</p>
        </aside>
      )}
    </div>
  );
}
