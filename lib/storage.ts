"use client";

import { useSyncExternalStore } from "react";

// Avisa a los componentes suscritos cuando cambia algo en localStorage desde esta pestaña.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
  listeners.forEach((l) => l());
}

export function removeStorage(key: string) {
  try { localStorage.removeItem(key); } catch {}
  listeners.forEach((l) => l());
}

// undefined en el servidor y durante la hidratación: "todavía no se sabe".
// null: no hay dato guardado.
export function useStoredRaw(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key),
    () => undefined,
  );
}
