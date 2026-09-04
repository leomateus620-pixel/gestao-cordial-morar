import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AgendaChecklistItem,
  AgendaEvent,
  AgendaEventInput,
  AgendaGuest,
  AgendaImobiliaria,
  AgendaParticipant,
  AgendaPrioridade,
  AgendaReminder,
  AgendaStatus,
  AgendaTipo,
  GoogleCalendarSyncStatus,
} from "@/types/agenda";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v?: string | null) => (v && UUID_RE.test(v) ? v : null);
const orNull = (v?: string | null) => (v && v.trim() ? v.trim() : null);
const orUndef = (v?: string | null) => (v ?? undefined) || undefined;

type DbEvent = {
  id: string;
  created_by: string;
  owner_user_id: string | null;
  tipo: AgendaTipo;
  status: AgendaStatus;
  prioridade: AgendaPrioridade;
  imobiliaria: AgendaImobiliaria;
  titulo: string;
  descricao: string | null;
  observacoes: string | null;
  inicio: string;
  fim: string | null;
  duracao_min: number | null;
  dia_inteiro: boolean;
  repeticao: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  atendimento_id: string | null;
  imovel_id: string | null;
  imovel_nome: string | null;
  imovel_endereco: string | null;
  imovel_descricao: string | null;
  agenciamento_id: string | null;
  local: string | null;
  video_call_url: string | null;
  responsavel_nome: string | null;
  criado_por_nome: string | null;
  google_calendar_sync_status: string;
  google_calendar_sync_error?: string | null;
  created_at: string;
  updated_at: string;
  agenda_event_participants?: Array<{
    user_id: string | null;
    nome: string;
    papel: AgendaParticipant["papel"];
  }>;
  agenda_event_checklist?: Array<{
    id: string;
    label: string;
    done: boolean;
    sort_order: number;
  }>;
  agenda_event_reminders?: Array<{
    id: string;
    tipo: AgendaReminder["tipo"] | "google_calendar";
    antecedencia_min: number;
    ativo: boolean;
    canal_futuro: boolean;
  }>;
  agenda_event_guests?: Array<{
    email: string;
    nome: string | null;
    response_status: string | null;
  }>;
};

function rowToEvent(row: DbEvent): AgendaEvent {
  const fim = row.fim ?? undefined;
  const duracao =
    row.duracao_min ??
    (fim
      ? Math.max(1, Math.round((new Date(fim).getTime() - new Date(row.inicio).getTime()) / 60000))
      : 60);
  return {
    id: row.id,
    titulo: row.titulo,
    descricao: orUndef(row.descricao),
    tipo: row.tipo,
    status: row.status,
    prioridade: row.prioridade,
    inicio: row.inicio,
    fim,
    duracaoMin: duracao,
    diaInteiro: row.dia_inteiro,
    repeticao: (row.repeticao ?? "nao") as AgendaEvent["repeticao"],
    imobiliaria: row.imobiliaria,
    clienteId: orUndef(row.cliente_id),
    clienteNome: orUndef(row.cliente_nome),
    atendimentoId: orUndef(row.atendimento_id),
    imovelId: orUndef(row.imovel_id),
    imovelNome: orUndef(row.imovel_nome),
    imovelEndereco: orUndef(row.imovel_endereco),
    imovelDescricao: orUndef(row.imovel_descricao),
    agenciamentoId: orUndef(row.agenciamento_id),
    local: orUndef(row.local),
    videoCallUrl: orUndef(row.video_call_url),
    responsavelPrincipalId: orUndef(row.owner_user_id),
    responsavelPrincipalNome: orUndef(row.responsavel_nome),
    participantes: (row.agenda_event_participants ?? []).map((p) => ({
      userId: p.user_id ?? "",
      nome: p.nome,
      papel: p.papel,
    })),
    convidados: (row.agenda_event_guests ?? []).map((g) => ({
      email: g.email,
      nome: g.nome ?? undefined,
      responseStatus: (g.response_status ?? "needsAction") as AgendaGuest["responseStatus"],
    })),
    lembretes: (row.agenda_event_reminders ?? []).map((r) => ({
      id: r.id,
      tipo: (r.tipo === "google_calendar" ? "interno" : r.tipo) as AgendaReminder["tipo"],
      antecedenciaMin: r.antecedencia_min,
      ativo: r.ativo,
      canalFuturo: r.canal_futuro,
    })),
    checklist: (row.agenda_event_checklist ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, label: c.label, done: c.done })),
    observacoes: orUndef(row.observacoes),
    criadoPorId: row.created_by,
    criadoPorNome: orUndef(row.criado_por_nome),
    atualizadoPorId: undefined,
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    googleCalendarSyncStatus: (row.google_calendar_sync_status ??
      "nao_sincronizado") as GoogleCalendarSyncStatus,
    googleCalendarSyncError: orUndef(row.google_calendar_sync_error ?? null),
  };
}

const SELECT =
  "*, agenda_event_participants(user_id,nome,papel), agenda_event_checklist(id,label,done,sort_order), agenda_event_reminders(id,tipo,antecedencia_min,ativo,canal_futuro), agenda_event_guests(email,nome,response_status)";

function validate(input: AgendaEventInput) {
  if (!input.titulo?.trim()) throw new Error("Título obrigatório");
  if (!input.inicio) throw new Error("Data/horário obrigatórios");
  const start = new Date(input.inicio);
  if (Number.isNaN(start.getTime())) throw new Error("Data inválida");
  if (input.fim) {
    const end = new Date(input.fim);
    if (Number.isNaN(end.getTime())) throw new Error("Horário final inválido");
    if (end.getTime() <= start.getTime())
      throw new Error("O horário final deve ser maior que o inicial");
  }
}

type DbErrorLike = { message: string; code?: string; details?: string | null; hint?: string | null };

/**
 * Erros do banco viram mensagens acionáveis, com log completo no servidor para
 * diagnóstico (código, detalhes e o recorte do payload que causou a rejeição).
 */
function agendaDbError(
  action: string,
  error: DbErrorLike,
  payload: Record<string, unknown>,
  userId: string,
) {
  console.error(`[agenda] falha ao ${action}`, {
    userId,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    imobiliaria: payload.imobiliaria,
    tipo: payload.tipo,
    owner_user_id: payload.owner_user_id,
  });
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return new Error(
      `Não foi possível ${action}: seu usuário não tem permissão para esta imobiliária (${String(
        payload.imobiliaria ?? "—",
      )}). Se você acabou de entrar no sistema, saia e entre novamente; se o problema continuar, peça ao administrador para liberar seu acesso.`,
    );
  }
  return new Error(
    `Não foi possível ${action}: ${error.message}${error.details ? ` (${error.details})` : ""}`,
  );
}

type ListScope = "todos" | "geral" | "fotos";
const PHOTO_TIPOS: AgendaTipo[] = ["fotos", "video"];

export const listAgendaEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { scope?: ListScope }) => d ?? {})
  .handler(async ({ data, context }) => {
    const scope: ListScope = data?.scope ?? "todos";
    let query = context.supabase
      .from("agenda_events")
      .select(SELECT)
      .is("deleted_at", null)
      .order("inicio", { ascending: true });
    if (scope === "fotos") query = query.in("tipo", PHOTO_TIPOS);
    else if (scope === "geral") query = query.not("tipo", "in", `(${PHOTO_TIPOS.join(",")})`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => rowToEvent(row as unknown as DbEvent));
  });

type UpsertInput = { id?: string; input: AgendaEventInput };

export const upsertAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpsertInput) => d)
  .handler(async ({ data, context }) => {
    const { id, input } = data;
    validate(input);
    const ownerId = asUuid(input.responsavelPrincipalId) ?? context.userId;
    const inicioIso = new Date(input.inicio).toISOString();
    const fimIso = input.fim ? new Date(input.fim).toISOString() : null;
    // A duração é sempre derivada do intervalo informado (o formulário não pede duração).
    const duracaoMin = fimIso
      ? Math.max(
          1,
          Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60000),
        )
      : (input.duracaoMin ?? 60);

    const payload = {
      owner_user_id: ownerId,
      tipo: input.tipo,
      status: input.status,
      prioridade: input.prioridade,
      imobiliaria: input.imobiliaria,
      titulo: input.titulo.trim(),
      descricao: orNull(input.descricao),
      observacoes: orNull(input.observacoes),
      inicio: inicioIso,
      fim: fimIso,
      duracao_min: duracaoMin,
      dia_inteiro: Boolean(input.diaInteiro),
      repeticao: input.repeticao ?? "nao",
      cliente_id: orNull(input.clienteId),
      cliente_nome: orNull(input.clienteNome),
      atendimento_id: orNull(input.atendimentoId),
      imovel_id: asUuid(input.imovelId),
      imovel_nome: orNull(input.imovelNome),
      imovel_endereco: orNull(input.imovelEndereco),
      imovel_descricao: orNull(input.imovelDescricao),
      agenciamento_id: asUuid(input.agenciamentoId),
      local: orNull(input.local) ?? orNull(input.imovelEndereco),
      video_call_url: orNull(input.videoCallUrl),
      responsavel_nome: orNull(input.responsavelPrincipalNome),
      google_calendar_sync_status: input.googleCalendarSyncStatus ?? "nao_sincronizado",
      concluido_em: input.status === "concluido" ? new Date().toISOString() : null,
    };

    let eventId = id;
    if (eventId) {
      const { error } = await context.supabase
        .from("agenda_events")
        .update(payload)
        .eq("id", eventId);
      if (error) throw agendaDbError("atualizar o compromisso", error, payload, context.userId);
    } else {
      const { data: inserted, error } = await context.supabase
        .from("agenda_events")
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw agendaDbError("salvar o compromisso", error, payload, context.userId);
      eventId = inserted.id;
    }

    // Replace children
    await context.supabase.from("agenda_event_participants").delete().eq("event_id", eventId);
    await context.supabase.from("agenda_event_checklist").delete().eq("event_id", eventId);
    await context.supabase.from("agenda_event_reminders").delete().eq("event_id", eventId);
    await context.supabase.from("agenda_event_guests").delete().eq("event_id", eventId);

    const participants = (input.participantes ?? [])
      .filter((p) => p.nome?.trim())
      .map((p) => ({
        event_id: eventId!,
        user_id: asUuid(p.userId),
        nome: p.nome.trim(),
        papel: p.papel ?? "participante",
      }));
    if (participants.length) {
      const { error } = await context.supabase
        .from("agenda_event_participants")
        .insert(participants);
      if (error) throw new Error(error.message);
    }

    const checklist = (input.checklist ?? [])
      .filter((c) => c.label?.trim())
      .map((c, i) => ({
        event_id: eventId!,
        label: c.label.trim(),
        done: Boolean(c.done),
        sort_order: i,
      }));
    if (checklist.length) {
      const { error } = await context.supabase.from("agenda_event_checklist").insert(checklist);
      if (error) throw new Error(error.message);
    }

    // Lembretes internos padrão: 1 dia, 1 hora e 30 min antes. O formulário não os edita,
    // então garantimos aqui que o aviso de 60 min sempre exista (sino + push).
    const reminders = (input.lembretes ?? []).map((r) => ({
      event_id: eventId!,
      tipo: r.tipo,
      antecedencia_min: r.antecedenciaMin,
      ativo: r.ativo,
      canal_futuro: Boolean(r.canalFuturo),
    }));
    if (reminders.length === 0) {
      for (const antecedencia of [1440, 60, 30]) {
        reminders.push({
          event_id: eventId!,
          tipo: "interno",
          antecedencia_min: antecedencia,
          ativo: true,
          canal_futuro: false,
        });
      }
    } else if (
      !reminders.some((r) => r.tipo === "interno" && r.antecedencia_min === 60 && r.ativo)
    ) {
      reminders.push({
        event_id: eventId!,
        tipo: "interno",
        antecedencia_min: 60,
        ativo: true,
        canal_futuro: false,
      });
    }
    if (reminders.length) {
      const { error } = await context.supabase.from("agenda_event_reminders").insert(reminders);
      if (error) throw new Error(error.message);
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set<string>();
    const guests = (input.convidados ?? [])
      .map((g) => ({ email: g.email?.trim().toLowerCase() ?? "", nome: g.nome?.trim() || null }))
      .filter((g) => {
        if (!EMAIL_RE.test(g.email)) return false;
        if (seenEmails.has(g.email)) return false;
        seenEmails.add(g.email);
        return true;
      })
      .map((g) => ({
        event_id: eventId!,
        email: g.email,
        nome: g.nome,
        response_status: "needsAction",
      }));
    if (guests.length) {
      const { error } = await context.supabase.from("agenda_event_guests").insert(guests);
      if (error) throw new Error(error.message);
    }

    // Sincronização automática (enfileirada + tentativa imediata no servidor).
    try {
      const { scheduleGoogleSync } = await import("@/lib/google-calendar/google.server");
      await scheduleGoogleSync(eventId!);
    } catch (e) {
      console.error("[agenda] sync google falhou:", e);
    }

    const { data: full, error: readErr } = await context.supabase
      .from("agenda_events")
      .select(SELECT)
      .eq("id", eventId)
      .single();
    if (readErr) throw new Error(readErr.message);
    return rowToEvent(full as unknown as DbEvent);
  });

export const softDeleteAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agenda_events")
      .update({ deleted_at: new Date().toISOString(), status: "cancelado" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);


    try {
      const { scheduleGoogleSync } = await import("@/lib/google-calendar/google.server");
      await scheduleGoogleSync(data.id);
    } catch (e) {
      console.error("[agenda] sync google delete falhou:", e);
    }
    return { ok: true };
  });

export const completeAgendaEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("agenda_events")
      .select("tipo, agenciamento_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const { error } = await context.supabase
      .from("agenda_events")
      .update({ status: "concluido", concluido_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Photo events completed against an agenciamento flip the "fotos_realizadas" checklist.
    if (existing && PHOTO_TIPOS.includes(existing.tipo as AgendaTipo) && existing.agenciamento_id) {
      const { error: upErr } = await context.supabase
        .from("agenciamentos")
        .update({ fotos_realizadas: true })
        .eq("id", existing.agenciamento_id);
      if (upErr) console.error("[agenda] update agenciamento fotos_realizadas falhou:", upErr);
    }

    try {
      const { scheduleGoogleSync } = await import("@/lib/google-calendar/google.server");
      await scheduleGoogleSync(data.id);
    } catch (e) {
      console.error("[agenda] sync google complete falhou:", e);
    }
    return { ok: true };
  });

/**
 * Atendimentos reais disponíveis para vincular a um compromisso.
 * A RLS já restringe o corretor aos seus próprios atendimentos.
 */
export const listAgendaAttendanceOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("attendances")
      .select(
        "id,cliente_nome,telefone,finalidade,tipo_imovel,corretor_nome,imovel_descricao,imovel_codigo,pipeline_stage,updated_at",
      )
      .not("pipeline_stage", "in", "(perdido,arquivado,em_espera)")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      clienteNome: row.cliente_nome,
      telefone: row.telefone ?? undefined,
      finalidade: row.finalidade ?? undefined,
      tipoImovel: row.tipo_imovel ?? undefined,
      corretorNome: row.corretor_nome ?? undefined,
      imovelDescricao: row.imovel_descricao ?? undefined,
      imovelCodigo: row.imovel_codigo ?? undefined,
      etapa: row.pipeline_stage ?? undefined,
    }));
  });
