// Sesión DEMO guardada en el navegador. Se reemplazará por Supabase Auth.
import { useMemo } from "react";
import type { Role } from "@/data/mock";
import { removeStorage, useStoredRaw, writeStorage } from "@/lib/storage";

export type Session = { name: string; role: Role };
const KEY = "conecta-session";

function parseSession(raw: string | null | undefined): Session | null {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return parseSession(localStorage.getItem(KEY));
}
export function setSession(s: Session) {
  writeStorage(KEY, JSON.stringify(s));
}
export function clearSession() {
  removeStorage(KEY);
}

// Devuelve undefined mientras se hidrata (aún no se sabe si hay sesión).
export function useSession(): Session | null | undefined {
  const raw = useStoredRaw(KEY);
  const session = useMemo(() => parseSession(raw), [raw]);
  return raw === undefined ? undefined : session;
}
