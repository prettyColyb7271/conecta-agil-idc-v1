import { NextResponse } from "next/server";
import { getCurrentUser, mfaRequiredResponse, passwordChangeRequired } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const mfaResponse = mfaRequiredResponse(user);
  if (mfaResponse) return mfaResponse;
  const params = new URL(request.url).searchParams;
  const date = params.get("date")?.trim() ?? "";
  const userId = params.get("userId")?.trim() ?? "";
  const eventType = params.get("eventType")?.trim() ?? "";
  const failedOnly = params.get("failed") === "1";
  const conditions = ["1 = 1"];
  const values: string[] = [];
  if (date) { conditions.push("substr(a.created_at, 1, 10) = ?"); values.push(date); }
  if (userId) { conditions.push("a.actor_id = ?"); values.push(userId); }
  if (eventType) { conditions.push("a.event_type = ?"); values.push(eventType); }
  if (failedOnly) { conditions.push("(a.event_type LIKE '%fallido%' OR a.event_type = 'login_bloqueado')"); }
  const rows = getDatabase().prepare(`
    SELECT a.id, a.created_at, a.actor_id, u.email, u.display_name, a.actor_role, a.event_type, a.entity_type, a.metadata_json
    FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.created_at DESC LIMIT 500
  `).all(...values) as Array<Record<string, unknown>>;
  const sessions = getDatabase().prepare(`
    SELECT s.id, s.user_id, u.email, u.display_name, u.role, s.created_at, s.last_seen_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.revoked_at IS NULL AND s.expires_at > ?
    ORDER BY s.last_seen_at DESC
  `).all(new Date().toISOString());
  const summary = getDatabase().prepare(`
    SELECT
      (SELECT COUNT(*) FROM audit_events WHERE substr(created_at, 1, 10) = date('now')) AS entries_today,
      (SELECT COUNT(*) FROM audit_events WHERE substr(created_at, 1, 10) = date('now') AND (event_type LIKE '%fallido%' OR event_type = 'login_bloqueado')) AS failed_today,
      (SELECT COUNT(*) FROM users WHERE status = 'bloqueado') AS blocked_users,
      (SELECT COUNT(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_mfa m WHERE m.user_id = u.id AND m.enabled_at IS NOT NULL)) AS without_mfa
  `).get();
  if (params.get("format") === "csv") {
    const header = ["fecha", "usuario", "correo", "rol", "evento", "entidad", "metadata"];
    const lines = [header.map(csvCell).join(",")];
    for (const row of rows) lines.push([row.created_at, row.display_name, row.email, row.actor_role, row.event_type, row.entity_type, row.metadata_json].map(csvCell).join(","));
    return new Response(lines.join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="bitacora-accesos.csv"', "x-content-type-options": "nosniff" } });
  }
  const users = getDatabase().prepare("SELECT id, email, display_name, role FROM users ORDER BY email").all();
  return NextResponse.json({ events: rows, sessions, users, summary });
}
