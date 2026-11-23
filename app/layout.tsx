import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider } from "@/components/prefs";

export const metadata: Metadata = {
  title: "Conecta Ágil | IDC Sistemas Eléctricos",
  description: "Gestión de trámites ante CFE",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
