import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Limite de eventos por relatório; acima disso o relatório avisa que foi truncado. */
const MAX_EVENTS = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type HistoryReportPeriod =
  | { period: "total" }
  | { period: "personalizado"; from: string; to: string };

export type HistoryReportAttendance = {
  id: string;
  clienteNome: string;
  telefone: string;
  email: string | null;
  finalidade: string;
  pipelineStage: string | null;
  status: string;
  origem: string;
  corretorId: string | null;
  corretorNome: string | null;
  imovelCodigo: string | null;
  imovelDescricao: string | null;
  proximoRetorno: string | null;
  proximoPasso: string | null;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type HistoryReportEvent = {
  id: string;
  attendanceId: string;
  eventType: string;
  actorName: string | null;
  description: string | null;
  previousValue: Json;
  newValue: Json;
  createdAt: string;
};

export type HistoryReportAssignment = {
  attendanceId: string;
  brokerId: string;
  assignedAt: string;
  firstOpenedAt: string | null;
  responseTimeSeconds: number | null;
  status: string;
};

export type HistoryReportResult = {
  attendances: HistoryReportAttendance[];
  events: HistoryReportEvent[];
  assignments: HistoryReportAssignment[];
  truncated: boolean;
};

const COLUMNS =
  "id,cliente_nome,telefone,email,finalidade,pipeline_stage,status,origem,corretor_id,corretor_nome,imovel_codigo,imovel_descricao,proximo_retorno,proximo_passo,observacoes,created_at,updated_at,cliente_id,cliente_convertido_id";

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

function parsePeriod(input: unknown): HistoryReportPeriod {
  const value = (input ?? {}) as Record<string, unknown>;
  if (value.period === "personalizado") {
    const from = String(value.from ?? "");
    const to = String(value.to ?? "");
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to)
      throw new Error("Período personalizado inválido.");
    return { period: "personalizado", from, to };
  }
  return { period: "total" };
}

/** Datas locais (horário de Brasília) convertidas em limites ISO. */
function bounds(p: HistoryReportPeriod) {
  if (p.period !== "personalizado") return null;
  return {
    start: new Date(`${p.from}T00:00:00-03:00`).toISOString(),
    end: new Date(`${p.to}T23:59:59.999-03:00`).toISOString(),
  };
}

async function assertAdmin(context: { supabase: AnyClient; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Somente a administração pode gerar este relatório.");
}

function mapAttendance(r: Row): HistoryReportAttendance {
  const s = (k: string) => (r[k] as string | null) ?? null;
  return {
    id: r.id as string,
    clienteNome: (r.cliente_nome as string) ?? "",
    telefone: (r.telefone as string) ?? "",
    email: s("email"),
    finalidade: (r.finalidade as string) ?? "",
    pipelineStage: s("pipeline_stage"),
    status: (r.status as string) ?? "",
    origem: (r.origem as string) ?? "",
    corretorId: s("corretor_id"),
    corretorNome: s("corretor_nome"),
    imovelCodigo: s("imovel_codigo"),
    imovelDescricao: s("imovel_descricao"),
    proximoRetorno: s("proximo_retorno"),
    proximoPasso: s("proximo_passo"),
    observacoes: s("observacoes"),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

async function loadRelated(
  supabase: AnyClient,
  rows: Row[],
  range: ReturnType<typeof bounds>,
  brokerId?: string,
): Promise<HistoryReportResult> {
  const ids = rows.map((r) => r.id as string);
  if (ids.length === 0) return { attendances: [], events: [], assignments: [], truncated: false };

  const events: Row[] = [];
  let truncated = false;
  for (let i = 0; i < ids.length && !truncated; i += 150) {
    let q = supabase
      .from("attendance_history")
      .select("id,attendance_id,event_type,actor_name,description,previous_value,new_value,created_at")
      .in("attendance_id", ids.slice(i, i + 150))
      .order("created_at", { ascending: true })
      .limit(MAX_EVENTS + 1);
    if (range) q = q.gte("created_at", range.start).lte("created_at", range.end);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    events.push(...((data ?? []) as Row[]));
    if (events.length > MAX_EVENTS) truncated = true;
  }

  const assignments: Row[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    let q = supabase
      .from("attendance_assignments")
      .select("attendance_id,broker_id,assigned_at,first_opened_at,response_time_seconds,status")
      .in("attendance_id", ids.slice(i, i + 150))
      .order("assigned_at", { ascending: true });
    if (brokerId) q = q.eq("broker_id", brokerId);
    if (range) q = q.gte("assigned_at", range.start).lte("assigned_at", range.end);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    assignments.push(...((data ?? []) as Row[]));
  }

  return {
    attendances: rows.map(mapAttendance),
    events: events.slice(0, MAX_EVENTS).map((r) => ({
      id: r.id as string,
      attendanceId: r.attendance_id as string,
      eventType: r.event_type as string,
      actorName: (r.actor_name as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      previousValue: (r.previous_value ?? null) as Json,
      newValue: (r.new_value ?? null) as Json,
      createdAt: r.created_at as string,
    })),
    assignments: assignments.map((r) => ({
      attendanceId: r.attendance_id as string,
      brokerId: r.broker_id as string,
      assignedAt: r.assigned_at as string,
      firstOpenedAt: (r.first_opened_at as string | null) ?? null,
      responseTimeSeconds: (r.response_time_seconds as number | null) ?? null,
      status: r.status as string,
    })),
    truncated,
  };
}

export const listBrokerAttendanceHistoryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brokerId: string } & HistoryReportPeriod) => {
    if (!UUID_RE.test(input?.brokerId ?? "")) throw new Error("Corretor inválido.");
    return { brokerId: input.brokerId, ...parsePeriod(input) };
  })
  .handler(async ({ data, context }): Promise<HistoryReportResult> => {
    await assertAdmin(context);
    const supabase = context.supabase as AnyClient;
    const range = bounds(data);
    const { data: rows, error } = await supabase
      .from("attendances")
      .select(COLUMNS)
      .eq("corretor_id", data.brokerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const all = (rows ?? []) as Row[];
    const result = await loadRelated(supabase, all, range, data.brokerId);
    if (!range) return result;
    // Inclui atendimentos criados no período OU com ao menos um evento no período.
    const withEvents = new Set(result.events.map((e) => e.attendanceId));
    const keep = new Set(
      all
        .filter(
          (r) =>
            withEvents.has(r.id as string) ||
            ((r.created_at as string) >= range.start && (r.created_at as string) <= range.end),
        )
        .map((r) => r.id as string),
    );
    return {
      ...result,
      attendances: result.attendances.filter((a) => keep.has(a.id)),
      assignments: result.assignments.filter((a) => keep.has(a.attendanceId)),
    };
  });

export const listClientAttendanceHistoryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { clientId?: string | null; attendanceIds?: string[] } & HistoryReportPeriod) => {
      const attendanceIds = (input?.attendanceIds ?? []).filter((id) => UUID_RE.test(id)).slice(0, 200);
      const clientId = input?.clientId && UUID_RE.test(input.clientId) ? input.clientId : null;
      if (!clientId && attendanceIds.length === 0) throw new Error("Selecione um cliente.");
      return { clientId, attendanceIds, ...parsePeriod(input) };
    },
  )
  .handler(async ({ data, context }): Promise<HistoryReportResult> => {
    await assertAdmin(context);
    const supabase = context.supabase as AnyClient;
    const range = bounds(data);
    const found = new Map<string, Row>();
    const add = (list: Row[] | null) => (list ?? []).forEach((r) => found.set(r.id as string, r));

    if (data.attendanceIds.length > 0) {
      const { data: rows, error } = await supabase.from("attendances").select(COLUMNS).in("id", data.attendanceIds);
      if (error) throw new Error(error.message);
      add(rows);
    }
    const clientIds = new Set<string>();
    if (data.clientId) clientIds.add(data.clientId);
    for (const r of found.values()) {
      if (r.cliente_id) clientIds.add(r.cliente_id as string);
      if (r.cliente_convertido_id) clientIds.add(r.cliente_convertido_id as string);
    }
    if (clientIds.size > 0) {
      const list = [...clientIds].join(",");
      const { data: rows, error } = await supabase
        .from("attendances")
        .select(COLUMNS)
        .or(`cliente_id.in.(${list}),cliente_convertido_id.in.(${list})`);
      if (error) throw new Error(error.message);
      add(rows);
    }
    const all = [...found.values()].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at)),
    );
    const result = await loadRelated(supabase, all, range);
    if (!range) return result;
    const withEvents = new Set(result.events.map((e) => e.attendanceId));
    return {
      ...result,
      attendances: result.attendances.filter(
        (a) => withEvents.has(a.id) || (a.createdAt >= range.start && a.createdAt <= range.end),
      ),
    };
  });
