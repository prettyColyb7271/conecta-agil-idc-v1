"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import { useStoredRaw, writeStorage } from "@/lib/storage";

export type Lang = "es" | "en";

export const dict = {
  es: {
    loginTitle: "INICIO SESIÓN",
    user: "Nombre de usuario",
    password: "Contraseña",
    register: "Registro",
    login: "Inicio de sesión",
    demo: "Modo demostración: el inicio de sesión real se conectará con Supabase.",
    demoHint: "Elige un perfil de demostración. No se valida la contraseña.",
    demoProfile: "Perfil de demostración",
    demoProfiles: {
      cliente: "Cliente (Prudencio)",
      gestor_tramites_cfe: "Rol histórico inactivo",
      coordinador_idc: "Gestor IDC (Olegario)",
      admin_seguridad: "Administrador de seguridad",
    },
    registerTitle: "REGISTRO",
    paterno: "Apellido paterno",
    materno: "Apellido materno",
    names: "Nombre/s",
    fullName: "Nombre completo",
    confirm: "Confirmar contraseña",
    email: "Correo",
    phone: "Celular",
    phonePh: "Número celular",
    message: "Solicitud de validación",
    messagePh: "Mensaje para validar la cuenta desde Zoho",
    messageDefault: "Por favor, validen mi cuenta.",
    proc: "Trámite",
    procPh: "Tipo de trámite",
    procs: [
      "Aprobación de proyecto y entrega-recepción de obra en MT",
      "Contratación y colocación de medidor",
      "Interconexión fotovoltaica (Generación Distribuida)",
    ],
    notice: "Tu petición se enviará y será evaluada a",
    submit: "Enviar solicitud",
    back: "Volver a inicio de sesión",
    mismatch: "Las contraseñas no coinciden.",
    sent: "Solicitud enviada. Queda pendiente de revisión antes de habilitar tu acceso.",
    settings: "Configuración",
    language: "Traducción",
    mode: "Modo",
    light: "Claro",
    dark: "Oscuro",
    save: "Guardar",
    exit: "Salir",
  },
  en: {
    loginTitle: "SIGN IN",
    user: "Username",
    password: "Password",
    register: "Sign up",
    login: "Sign in",
    demo: "Demo mode: real sign-in will be connected to Supabase.",
    demoHint: "Choose a demo profile. The password is not validated.",
    demoProfile: "Demo profile",
    demoProfiles: {
      cliente: "Client (Prudencio)",
      gestor_tramites_cfe: "Inactive historical role",
      coordinador_idc: "IDC manager (Olegario)",
      admin_seguridad: "Security administrator",
    },
    registerTitle: "SIGN UP",
    paterno: "Paternal last name",
    materno: "Maternal last name",
    names: "First name(s)",
    fullName: "Full first name",
    confirm: "Confirm password",
    email: "Email",
    phone: "Mobile",
    phonePh: "Mobile number",
    message: "Validation request",
    messagePh: "Message to validate the account from Zoho",
    messageDefault: "Please validate my account.",
    proc: "Procedure",
    procPh: "Procedure type",
    procs: [
      "Project approval and work handover (MV)",
      "Supply contract and meter installation",
      "Photovoltaic interconnection (Distributed Generation)",
    ],
    notice: "Your request will be sent and reviewed by",
    submit: "Send request",
    back: "Back to sign in",
    mismatch: "Passwords do not match.",
    sent: "Request sent. It stays pending review before your access is enabled.",
    settings: "Settings",
    language: "Language",
    mode: "Mode",
    light: "Light",
    dark: "Dark",
    save: "Save",
    exit: "Exit",
  },
};

type Ctx = {
  dark: boolean;
  lang: Lang;
  t: typeof dict.es;
  apply: (dark: boolean, lang: Lang) => void;
};

const PrefsContext = createContext<Ctx | null>(null);
const PREFS_KEY = "conecta-prefs";

function readPrefs(raw: string | null | undefined): { dark: boolean; lang: Lang } {
  try {
    const saved = JSON.parse(raw || "null");
    if (saved) return { dark: !!saved.dark, lang: saved.lang === "en" ? "en" : "es" };
  } catch {}
  return { dark: true, lang: "es" };
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  // Lo guardado en este navegador; antes de hidratar usa los valores por defecto
  const raw = useStoredRaw(PREFS_KEY);
  const { dark, lang } = useMemo(() => readPrefs(raw), [raw]);

  const apply = (d: boolean, l: Lang) => {
    writeStorage(PREFS_KEY, JSON.stringify({ dark: d, lang: l }));
  };

  return (
    <PrefsContext.Provider value={{ dark, lang, t: dict[lang], apply }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs debe usarse dentro de PrefsProvider");
  return ctx;
}
