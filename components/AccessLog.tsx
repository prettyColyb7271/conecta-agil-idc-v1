"use client";

import { useEffect, useState } from "react";

type EventRow = { id: string; event_type: string; created_at: string; user_email?: string; metadata_json?: string };

export default function AccessLog() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/admin/access").then(async (response) => {
      const data = await response.json() as { events?: EventRow[]; error?: string };
      if (!response.ok) setMessage(data.error ?? "No se pudo cargar la bitácora.");
      else setEvents(data.events ?? []);
    });
  }, []);
  return <main className="mx-auto max-w-5xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">Bitácora de accesos</h1>
    {message && <p role="alert">{message}</p>}
    <div className="overflow-auto"><table className="w-full text-sm"><thead><tr><th>Fecha</th><th>Usuario</th><th>Evento</th><th>Metadata</th></tr></thead><tbody>
      {events.map((event) => <tr key={event.id}><td>{event.created_at}</td><td>{event.user_email ?? "—"}</td><td>{event.event_type}</td><td>{event.metadata_json ?? "—"}</td></tr>)}
    </tbody></table></div>
  </main>;
}
