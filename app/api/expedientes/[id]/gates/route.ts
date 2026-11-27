import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { addExternalEvent, GateConflictError, GateValidationError, listGates, transitionGate } from "@/lib/data/gates";
import { readJson, RequestInputError } from "@/lib/http";
import { getDatabase } from "@/lib/db/sqlite";
import { sendEmail } from "@/lib/email";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    const blocked = passwordChangeRequired(user);
    if (blocked) return blocked;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    return Response.json({ gates: listGates(user, (await params).id) });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    return Response.json({ error: "No fue posible consultar los gates." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const blocked = passwordChangeRequired(user);
    if (blocked) return blocked;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ action?: "close" | "reopen" | "event"; gateCode?: string; reason?: string; requirementCodes?: string[]; feedback?: unknown; internalNotes?: unknown; eventType?: "firma_presencial" | "ingreso_acuse" | "cfe_incompleto" | "resolucion_cfe" | "contrato" | "uiie" | "visita_uiie" | "certificado_uiie" | "medidor" | "interconexion" | "alta_comercial" | "cierre"; eventDate?: string; description?: string; documentId?: string; lugar?: string; firmantes?: string[]; medio?: string; solicitudNumero?: string; vigenciaMeses?: number; venceAt?: string; resultado?: "favorable" | "condicionado" | "no_favorable"; subgateRequerido?: boolean; subgateDocumentId?: string }>(request);
    const id = (await params).id;
    if (body.action === "event") {
      if (!body.eventType) return Response.json({ error: "eventType es obligatorio." }, { status: 400 });
      if (body.eventType === "cfe_incompleto" && (typeof body.description !== "string" || !body.description.trim())) return Response.json({ error: "El mensaje general al cliente es obligatorio." }, { status: 400 });
      const description = [body.description, body.lugar ? `Lugar: ${body.lugar}` : "", body.firmantes?.length ? `Firmantes: ${body.firmantes.join(", ")}` : ""].filter(Boolean).join(" · ");
      const event = addExternalEvent(user, id, { eventType: body.eventType, eventDate: body.eventDate, description, documentId: body.documentId, medio: body.medio, solicitudNumero: body.solicitudNumero, vigenciaMeses: body.vigenciaMeses, venceAt: body.venceAt, resultado: body.resultado, subgateRequerido: body.subgateRequerido, subgateDocumentId: body.subgateDocumentId, requirementCodes: body.requirementCodes, feedback: body.feedback, internalNotes: body.internalNotes });
      let warning: string | undefined;
      if (body.eventType === "cfe_incompleto") {
        const recipient = getDatabase().prepare("SELECT u.email, e.folio FROM expedientes e JOIN users u ON u.id = e.cliente_id WHERE e.id = ?").get(id) as { email: string; folio: string };
        try {
          await sendEmail({ to: recipient.email, subject: "CFE pidió correcciones en tu expediente", text: `CFE pidió correcciones en tu expediente ${recipient.folio}; entra a tu portal.` });
        } catch (error) {
          console.error("No se pudo enviar el aviso de reproceso CFE:", error);
          warning = "El reproceso se registró, pero no se pudo enviar el correo. Avisa al cliente por otro medio; no vuelvas a registrar el reproceso.";
        }
      }
      return Response.json({ event, warning }, { status: 201 });
    }
    if (!body.action || !body.gateCode) return Response.json({ error: "action y gateCode son obligatorios." }, { status: 400 });
    return Response.json({ gates: transitionGate(user, id, body.gateCode, body.action, body.reason, body.requirementCodes) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof GateValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof GateConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    return Response.json({ error: "No fue posible actualizar el gate." }, { status: 500 });
  }
}
