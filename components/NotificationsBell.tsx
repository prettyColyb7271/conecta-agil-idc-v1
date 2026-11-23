"use client";

import { useEffect, useState } from "react";

type Notification = { id: string; title: string; body: string; read_at: string | null };

export default function NotificationsBell({ localMode }: { localMode: boolean }) {
  const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => {
    if (!localMode) return;
    void fetch("/api/notifications").then((response) => response.ok ? response.json() : null).then((body) => {
      if (body) setItems(body.notifications ?? []);
    });
  }, [localMode]);
  if (!localMode) return null;
  const unread = items.filter((item) => !item.read_at);
  return (
    <details className="relative text-left">
      <summary className="cursor-pointer list-none rounded border border-white/60 px-3 py-1 text-sm">
        Notificaciones {unread.length > 0 && <span className="ml-1 rounded-full bg-[#10c98a] px-1.5 text-[#0d1f33]">{unread.length}</span>}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-72 rounded border border-[#8da9c5] bg-white p-2 text-[#0d1f33] shadow-lg">
        {items.length === 0 ? <p className="text-xs">No hay notificaciones.</p> : items.map((item) => (
          <div key={item.id} className="border-b border-slate-200 py-2 text-xs last:border-0">
            <p className="font-bold">{item.title}</p><p>{item.body}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
