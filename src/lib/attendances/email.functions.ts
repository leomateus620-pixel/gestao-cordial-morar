import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL_TYPE = "first_attendance_thank_you";
const TEMPLATE_NAME = "first-attendance-thank-you";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SendResult =
  | { status: "sent" | "pending"; logId: string }
  | { status: "skipped"; reason: "no_email" | "invalid_email" | "already_sent" | "no_attendance" }
  | { status: "failed"; error: string };

function isPlaceholder(v?: string | null) {
  if (!v) return true;
  const t = v.trim().toLowerCase();
  if (!t) return true;
  return ["a definir", "null", "undefined", "n/a"].includes(t);
}

export const sendFirstAttendanceEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attendanceId: string }) => d)
  .handler(async ({ data, context }): Promise<SendResult> => {
    const { supabase, userId } = context;

    const { data: att, error: attErr } = await supabase
      .from("attendances")
      .select(
        "id, cliente_nome, email, imobiliaria, finalidade, tipo_imovel, bairro_interesse, orcamento_min, orcamento_max",
      )
      .eq("id", data.attendanceId)
      .maybeSingle();

    if (attErr || !att) {
      return { status: "skipped", reason: "no_attendance" };
    }

    const recipient = (att.email ?? "").trim();
    if (isPlaceholder(recipient)) {
      await supabase.from("email_logs").insert({
        attendance_id: att.id,
        recipient_email: null,
        email_type: EMAIL_TYPE,
        status: "skipped",
        error_message: "Cliente sem e-mail.",
        created_by: userId,
      });
      return { status: "skipped", reason: "no_email" };
    }
    if (!EMAIL_RE.test(recipient)) {
      await supabase.from("email_logs").insert({
        attendance_id: att.id,
        recipient_email: recipient,
        email_type: EMAIL_TYPE,
        status: "skipped",
        error_message: "E-mail inválido.",
        created_by: userId,
      });
      return { status: "skipped", reason: "invalid_email" };
    }

    // Idempotência — não reenvia se já existir um log 'sent'.
    const { data: existing } = await supabase
      .from("email_logs")
      .select("id")
      .eq("attendance_id", att.id)
      .eq("email_type", EMAIL_TYPE)
      .eq("status", "sent")
      .maybeSingle();
    if (existing) {
      return { status: "skipped", reason: "already_sent" };
    }

    const templateData = {
      clienteNome: att.cliente_nome,
      imobiliaria: att.imobiliaria,
      finalidade: att.finalidade,
      tipoImovel: att.tipo_imovel,
      regiao: att.bairro_interesse ?? undefined,
      orcamentoMin: att.orcamento_min !== null ? Number(att.orcamento_min) : undefined,
      orcamentoMax: att.orcamento_max !== null ? Number(att.orcamento_max) : undefined,
    };

    const subject =
      att.imobiliaria === "cordial"
        ? "Obrigado pelo contato com a Cordial Imóveis"
        : att.imobiliaria === "morar"
        ? "Obrigado pelo contato com a Morar Imóveis"
        : "Obrigado pelo contato com a Gestão Cordial & Morar";

    const { data: pending, error: insErr } = await supabase
      .from("email_logs")
      .insert({
        attendance_id: att.id,
        recipient_email: recipient,
        email_type: EMAIL_TYPE,
        subject,
        status: "pending",
        provider: "lovable-emails",
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !pending) {
      return { status: "failed", error: insErr?.message ?? "Falha ao criar log." };
    }

    // Chama a rota interna de envio transacional (que enfileira o e-mail).

    try {
      const server = await import("@tanstack/react-start/server");
      const token = server.getRequestHeader?.("authorization") ?? "";
      const reqUrl = server.getRequestUrl();
      const base = `${reqUrl.protocol}//${reqUrl.host}`;
      const resp = await fetch(`${base}/lovable/email/transactional/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: token,
        },
        body: JSON.stringify({
          templateName: TEMPLATE_NAME,
          recipientEmail: recipient,
          idempotencyKey: `${EMAIL_TYPE}:${att.id}`,
          templateData,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        reason?: string;
      };
      if (!resp.ok || json?.success === false) {
        const msg = json?.error || json?.reason || `HTTP ${resp.status}`;
        await supabase
          .from("email_logs")
          .update({ status: "failed", error_message: String(msg) })
          .eq("id", pending.id);
        return { status: "failed", error: String(msg) };
      }
      await supabase
        .from("email_logs")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", pending.id);
      return { status: "sent", logId: pending.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("email_logs")
        .update({ status: "failed", error_message: msg })
        .eq("id", pending.id);
      return { status: "failed", error: msg };
    }
  });

/**
 * Envia e-mail ao corretor responsável quando um atendimento é atribuído a ele.
 * Idempotente por (atendimento, corretor) via idempotencyKey.
 */
const ASSIGN_TYPE = "broker_assignment";
const ASSIGN_TEMPLATE = "broker-assignment";

const finalidadeLabelMap: Record<string, string> = {
  compra: "Compra",
  aluguel: "Locação",
  ambos: "Compra ou locação",
};
const tipoImovelLabelMap: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  cobertura: "Cobertura",
  studio: "Studio",
  terreno: "Terreno",
  sitio: "Sítio",
  sala_comercial: "Sala comercial",
  galpao: "Galpão",
};

export const sendBrokerAssignmentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attendanceId: string; corretorId: string }) => d)
  .handler(async ({ data, context }): Promise<SendResult> => {
    const { supabase, userId } = context;

    const [{ data: att }, { data: corretor }, { data: atribuidoProfile }] = await Promise.all([
      supabase
        .from("attendances")
        .select(
          "id, cliente_nome, telefone, imobiliaria, finalidade, tipo_imovel, bairro_interesse, orcamento_min, orcamento_max, corretor_id",
        )
        .eq("id", data.attendanceId)
        .maybeSingle(),
      supabase.from("profiles").select("id,nome,email").eq("id", data.corretorId).maybeSingle(),
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
    ]);

    if (!att) return { status: "skipped", reason: "no_attendance" };
    if (!corretor?.email) return { status: "skipped", reason: "no_email" };
    const recipient = corretor.email.trim();
    if (!EMAIL_RE.test(recipient)) return { status: "skipped", reason: "invalid_email" };

    const idempotencyKey = `${ASSIGN_TYPE}:${att.id}:${data.corretorId}`;

    const { data: existing } = await supabase
      .from("email_logs")
      .select("id")
      .eq("attendance_id", att.id)
      .eq("email_type", ASSIGN_TYPE)
      .eq("recipient_email", recipient)
      .eq("status", "sent")
      .maybeSingle();
    if (existing) return { status: "skipped", reason: "already_sent" };

    const templateData = {
      corretorNome: corretor.nome,
      clienteNome: att.cliente_nome,
      telefone: att.telefone ?? undefined,
      imobiliaria: att.imobiliaria,
      finalidade: att.finalidade
        ? finalidadeLabelMap[att.finalidade as string] ?? att.finalidade
        : undefined,
      tipoImovel: att.tipo_imovel
        ? tipoImovelLabelMap[att.tipo_imovel as string] ?? att.tipo_imovel
        : undefined,
      regiao: att.bairro_interesse ?? undefined,
      orcamentoMin: att.orcamento_min !== null ? Number(att.orcamento_min) : undefined,
      orcamentoMax: att.orcamento_max !== null ? Number(att.orcamento_max) : undefined,
      atribuidoPor: atribuidoProfile?.nome ?? undefined,
      link: `https://cordialgestao.com/atendimentos?id=${att.id}`,
    };

    const { data: pending, error: insErr } = await supabase
      .from("email_logs")
      .insert({
        attendance_id: att.id,
        recipient_email: recipient,
        email_type: ASSIGN_TYPE,
        subject: `Novo atendimento atribuído — ${att.cliente_nome ?? ""}`.trim(),
        status: "pending",
        provider: "lovable-emails",
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !pending) {
      return { status: "failed", error: insErr?.message ?? "Falha ao criar log." };
    }

    try {
      const server = await import("@tanstack/react-start/server");
      const token = server.getRequestHeader?.("authorization") ?? "";
      const reqUrl = server.getRequestUrl();
      const base = `${reqUrl.protocol}//${reqUrl.host}`;
      const resp = await fetch(`${base}/lovable/email/transactional/send`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: token },
        body: JSON.stringify({
          templateName: ASSIGN_TEMPLATE,
          recipientEmail: recipient,
          idempotencyKey,
          templateData,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        reason?: string;
      };
      if (!resp.ok || json?.success === false) {
        const msg = json?.error || json?.reason || `HTTP ${resp.status}`;
        await supabase
          .from("email_logs")
          .update({ status: "failed", error_message: String(msg) })
          .eq("id", pending.id);
        return { status: "failed", error: String(msg) };
      }
      await supabase
        .from("email_logs")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", pending.id);
      return { status: "sent", logId: pending.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("email_logs")
        .update({ status: "failed", error_message: msg })
        .eq("id", pending.id);
      return { status: "failed", error: msg };
    }
  });


