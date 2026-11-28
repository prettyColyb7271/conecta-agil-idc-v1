import { requireRole } from "@/lib/auth";
import { getAdminConfiguration } from "@/lib/admin/configuration";
import { MessageBox, PageHeading, Panel } from "@/components/ui";
import { formatoFechaHora } from "@/lib/fechas";

export const instant = false;

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "No aplica";
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(1)} ${unit}`;
}

function formatTimestamp(value: string | null): string {
  return value ? formatoFechaHora(value) : "Sin registro";
}

function Item({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 break-words text-xs font-semibold">{value}</dd>
    </div>
  );
}

export default async function ConfiguracionPage() {
  await requireRole("admin_seguridad");
  let data;
  try {
    data = getAdminConfiguration();
  } catch (error) {
    console.error("No fue posible consultar la configuración del sistema.", error);
    return <MessageBox tone="error">No fue posible consultar la configuración del sistema.</MessageBox>;
  }
  return (
    <div className="space-y-4">
      <PageHeading title="Configuración" />
      <Panel title="Estado del sistema">
        <div className="space-y-2">
          <section>
            <h2 className="mb-1 text-sm font-bold">Servicio y datos</h2>
            <dl className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              <Item label="Modo" value={data.mode} />
              <Item label="Versión" value={data.version} />
              <Item label="Versión del esquema de datos" value={data.schemaVersion ?? "No aplica"} />
              <Item label="Hora del servidor (Hermosillo)" value={data.serverTime} />
              <Item label="Ubicación de datos" value={data.storageLocation} />
              <Item label="Base de datos (SQLite)" value={formatBytes(data.databaseBytes)} />
              <Item label="Archivos de documentos" value={formatBytes(data.documentsBytes)} />
            </dl>
          </section>
          <section>
            <h2 className="mb-1 text-sm font-bold">Correo y Zoho</h2>
            <dl className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              <Item label="Transporte de correo" value={data.emailTransport} />
              <Item label="Remitente configurado" value={data.emailSenderConfigured ? "Sí" : "No"} />
              <Item label="Transporte de Zoho Projects" value={data.zohoTransport} />
              <Item label="Último envío correcto" value={formatTimestamp(data.zohoLastSuccessAt)} />
              <Item label="Envíos fallidos" value={data.zohoFailed} />
            </dl>
          </section>
          <section>
            <h2 className="mb-1 text-sm font-bold">Seguridad</h2>
            <dl className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              <Item label="Roles con MFA obligatorio" value={data.requiredMfaRoles.join(", ")} />
              <Item label="Duración de la sesión" value={`${data.sessionHours} horas`} />
              <Item label="Contraseña mínima" value={`${data.minimumPasswordLength} caracteres`} />
              <Item label="Última rotación MFA" value={formatTimestamp(data.mfaRotationAt)} />
              <Item label="Respaldos" value="Sin respaldos automáticos — ver D2" />
            </dl>
          </section>
        </div>
      </Panel>
      <MessageBox>Configuración sensible: los cambios se hacen en el servidor, no desde esta pantalla, y nadie necesita conocer contraseñas ni abrir documentos.</MessageBox>
    </div>
  );
}
