"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "No fue posible cambiar la contraseña.");
      return;
    }
    router.replace("/gestor");
    router.refresh();
  }

  return (
    <main className="mx-auto mt-12 max-w-lg rounded bg-white p-6 shadow">
      <h1 className="text-xl font-bold">Cambia tu contraseña</h1>
      <p className="mt-2 text-sm">Por seguridad debes reemplazar la contraseña temporal antes de continuar.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Contraseña temporal actual" className="w-full border px-3 py-2" />
        <input required minLength={12} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contraseña (mínimo 12 caracteres)" className="w-full border px-3 py-2" />
        <button type="submit" className="rounded bg-[#5885b1] px-3 py-2 font-bold text-white">Guardar nueva contraseña</button>
      </form>
      {message && <p role="alert" className="mt-3 text-sm text-red-700">{message}</p>}
    </main>
  );
}
