import Link from "next/link";
import { AdminDashboardData } from "@/lib/admin/dashboard";
import { EmptyState, MetricCard, PageHeading, Panel, SmallButton, StatusBadge } from "@/components/ui";

const QUICK_LINKS = [
  { href: "/admin/usuarios", label: "Cuentas" },
  { href: "/admin/accesos", label: "Accesos" },
  { href: "/admin/integraciones", label: "Integraciones" },
  { href: "/seguridad", label: "Seguridad" },
];

export default function AdminInicio({ data }: { data: AdminDashboardData }) {
  const activityItems = [
    { key: "login-ok", label: "Inicios de sesión correctos", value: data.activity.loginsOk },
    { key: "login-failed", label: "Inicios de sesión fallidos", value: data.activity.loginsFailed },
    { key: "blocks", label: "Bloqueos", value: data.activity.blocks },
    { key: "mfa-failed", label: "MFA fallidos", value: data.activity.mfaFailed },
    { key: "mfa-decrypt", label: "Descifrados MFA fallidos", value: data.activity.mfaDecryptFailed },
    { key: "password-links", label: "Enlaces de contraseña emitidos", value: data.activity.passwordLinks },
  ];
  const activityTotal = activityItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-4">
      <PageHeading
        title="Administración de seguridad"
        description="Resumen de cuentas, MFA, actividad e integraciones. Solo se muestran metadatos."
        badge={data.example && <StatusBadge tone="info">Ejemplo</StatusBadge>}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Panel title="Cuentas">
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:col-span-2">
              <h3 className="font-bold">Totales por rol</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {data.roles.map((item) => (
                  <li key={item.role} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-3 py-2 text-sm">
                    <span>{item.label}</span><strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="font-bold">Totales por estado</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {data.statuses.map((item) => (
                  <li key={item.status} className="flex justify-between gap-2"><span>{item.label}</span><strong>{item.count}</strong></li>
                ))}
              </ul>
            </section>
            <div className="grid gap-3">
              <MetricCard label="Pendientes de contraseña" value={data.pendingPasswords} />
              <MetricCard label="Solicitudes de registro pendientes" value={data.pendingRegistrations} />
            </div>
          </div>
        </Panel>

        <Panel title="Autenticación MFA">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Cuentas con MFA activo" value={data.mfa.enabled} />
            <section className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-bold">Roles que lo requieren</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {data.mfa.requiredRoles.map((item) => <li key={item.role}>{item.label}</li>)}
              </ul>
            </section>
          </div>
          <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-bold">Cuentas obligatorias sin vincular</h3>
            {data.mfa.missingRequired.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {data.mfa.missingRequired.map((item, index) => <li key={`${item.role}-${item.name}-${index}`}>{item.name} · {item.role}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-600">Todas las cuentas de los roles obligatorios tienen MFA activo.</p>}
          </section>
        </Panel>

        <Panel title="Actividad de las últimas 24 horas">
          {activityTotal === 0 ? <EmptyState>Aún no hay actividad.</EmptyState> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {activityItems.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span>{item.label}</span><strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Integraciones">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Pendientes" value={data.integrations.pending} />
            <MetricCard label="Enviados" value={data.integrations.sent} />
            <MetricCard label="Fallidos" value={data.integrations.failed} />
          </div>
          <p className="mt-3 text-sm">Transporte actual: <strong>{data.integrations.transport.toUpperCase()}</strong></p>
          <Link className="mt-3 inline-flex rounded-md bg-[#5885b1] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3d6a99]" href="/admin/integraciones">Ver Integraciones</Link>
        </Panel>

        <Panel title="Aviso de privacidad">
          <p className="text-sm font-semibold">Aviso de privacidad vigente: versión {data.privacyNotice.version} (borrador)</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Expedientes con versión vigente" value={data.privacyNotice.currentAccepted} />
            <MetricCard label="Expedientes con versión anterior" value={data.privacyNotice.previousAccepted} />
          </div>
        </Panel>

        <Panel title="Alertas">
          {data.alerts.blockedResponsibles.length === 0 && data.alerts.failedOutbox === 0 ? (
            <EmptyState>Sin alertas activas.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Envíos fallidos" value={data.alerts.failedOutbox} />
              <section className="rounded-lg border border-slate-200 bg-white p-3">
                <h3 className="text-sm font-bold">Expedientes con responsable bloqueado</h3>
                <p className="mt-1 text-2xl font-extrabold">{data.alerts.blockedResponsibles.length}</p>
                {data.alerts.blockedResponsibles.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {data.alerts.blockedResponsibles.map((folio) => <li key={folio} className="rounded bg-slate-100 px-2 py-1 text-sm font-semibold">{folio}</li>)}
                  </ul>
                ) : <p className="mt-2 text-sm text-slate-600">Ninguno.</p>}
              </section>
            </div>
          )}
        </Panel>

        <Panel title="Accesos rápidos">
          <nav aria-label="Accesos rápidos de administración" className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((item) => (
              <Link key={item.href} href={item.href}><SmallButton>{item.label}</SmallButton></Link>
            ))}
          </nav>
        </Panel>
      </div>
    </div>
  );
}
