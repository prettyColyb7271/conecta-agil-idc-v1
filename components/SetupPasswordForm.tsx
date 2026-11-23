"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SetupPasswordForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 12 || password !== confirmation) {
      setMessage("La contraseña debe tener al menos 12 caracteres y coincidir en ambos campos.");
      return;
    }
    const response = await fetch("/api/auth/setup-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.get("token") ?? "", newPassword: password }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "El enlace no es válido, expiró o ya fue utilizado.");
      return;
    }
    setComplete(true);
    setMessage("Contraseña definida. Ya puedes iniciar sesión.");
  }

  return (
    <main className="mx-auto mt-12 max-w-md rounded-sm bg-[#b6cde3] p-6 text-[#0d1f33]">
      <h1 className="text-xl font-bold">Definir contraseña</h1>
      {complete ? <p className="mt-4 text-sm">{message}</p> : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm">Nueva contraseña<input required minLength={12} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full border px-2 py-2" /></label>
          <label className="block text-sm">Confirmar contraseña<input required minLength={12} type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full border px-2 py-2" /></label>
          <button type="submit" className="border border-[#5885b1] bg-white px-3 py-2 text-sm font-bold">Guardar contraseña</button>
          {message && <p className="text-sm">{message}</p>}
        </form>
      )}
    </main>
  );
}
