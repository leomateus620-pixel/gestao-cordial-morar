import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Atendimento,
  AtendimentoCreateInput,
  AtendimentoFinalidade,
  AtendimentoStageTransition,
  AtendimentoStatus,
  AtendimentoUpdatePatch,
  ContatoPreferencialAtendimento,
  DormitoriosAtendimento,
  ImobiliariaAtendimento,
  OrigemLeadAtendimento,
  PipelineStage,
  PrioridadeAtendimento,
  ProximoPassoAtendimento,
  TipoImovelInteresse,
} from "@/types/atendimento";
import { statusToPipelineStage } from "@/types/atendimento";
import { mapCanonicalPropertyFields } from "@/lib/attendances/attendance-field-mapping";

type DbRow = {
  id: string;
  created_by: string;
  imobiliaria: string;
  cliente_id: string | null;
  cliente_nome: string;
  telefone: string;
  email: string | null;
  contato_preferencial: string;
  origem: string;
  finalidade: string;
  tipo_imovel: string;
  dormitorios: string | null;
  bairro_interesse: string | null;
  orcamento_min: number | string | null;
  orcamento_max: number | string | null;
  imovel_id: string | null;
  imovel_ref?: string | null;
  imovel_codigo: string | null;
  imovel_descricao: string | null;
  imovel_endereco?: string | null;
  imovel_bairro?: string | null;
  imovel_cidade?: string | null;
  imovel_tipo?: string | null;
  imovel_valor?: number | string | null;
  interesse_descricao?: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  prioridade: string;
  status: string;
  pipeline_stage: string | null;
  proximo_retorno: string | null;
  proximo_passo: string | null;
  observacoes: string | null;
  historico_inicial: string | null;
  motivo_perda: string | null;
  convertido_em_cliente: boolean;
  cliente_convertido_id: string | null;
  opened_at: string | null;
  opened_by: string | null;
  created_at: string;
  updated_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v?: string | null) => (v && UUID_RE.test(v) ? v : null);
const orNull = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const orUndef = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

function rowToAtendimento(
  row: DbRow,
  lastStageTransition?: AtendimentoStageTransition,
): Atendimento {
  const id = row.id;
  const criadoEm = row.created_at;
  const initial = row.historico_inicial?.trim();
  const canonicalProperty = mapCanonicalPropertyFields({
    propertyId: orUndef(row.imovel_ref) ?? orUndef(row.imovel_id),
    propertyCode: row.imovel_codigo,
    propertyTitle: row.imovel_descricao,
    interestDescription: row.interesse_descricao,
  });
  const imovelId = canonicalProperty.propertyId;
  const imovelDescricao = canonicalProperty.propertyTitle;
  return {
    id,
    clienteId: orUndef(row.cliente_id) ?? undefined,
    clienteNome: row.cliente_nome,
    telefone: row.telefone,
    email: orUndef(row.email) ?? undefined,
    contatoPreferencial: row.contato_preferencial as ContatoPreferencialAtendimento,
    origem: row.origem as OrigemLeadAtendimento,
    imobiliaria: row.imobiliaria as ImobiliariaAtendimento,
    corretorId: orUndef(row.corretor_id) ?? undefined,
    corretorNome: orUndef(row.corretor_nome) ?? undefined,
    finalidade: row.finalidade as AtendimentoFinalidade,
    tipoImovel: row.tipo_imovel as TipoImovelInteresse,
    dormitorios: (orUndef(row.dormitorios) as DormitoriosAtendimento | undefined) ?? undefined,
    bairroInteresse: orUndef(row.bairro_interesse) ?? undefined,
    orcamentoMin: row.orcamento_min !== null ? Number(row.orcamento_min) : undefined,
    orcamentoMax: row.orcamento_max !== null ? Number(row.orcamento_max) : undefined,
    imovelId,
    imovelCodigo: canonicalProperty.propertyCode,
    imovelDescricao,
    imovel:
      imovelId && imovelDescricao
        ? {
            id: imovelId,
            titulo: imovelDescricao,
            codigo: orUndef(row.imovel_codigo),
            endereco: orUndef(row.imovel_endereco),
            bairro: orUndef(row.imovel_bairro),
            cidade: orUndef(row.imovel_cidade),
            tipo: orUndef(row.imovel_tipo),
            valor:
              row.imovel_valor !== null && row.imovel_valor !== undefined
                ? Number(row.imovel_valor)
                : undefined,
          }
        : undefined,
    interesseDescricao: canonicalProperty.interestDescription,
    prioridade: row.prioridade as PrioridadeAtendimento,
    status: row.status as AtendimentoStatus,
    pipelineStage:
      (row.pipeline_stage as PipelineStage | null) ??
      statusToPipelineStage(row.status as AtendimentoStatus),
    lastStageTransition,
    proximoRetorno: orUndef(row.proximo_retorno) ?? undefined,
    proximoPasso: (orUndef(row.proximo_passo) as ProximoPassoAtendimento | undefined) ?? undefined,
    observacoes: orUndef(row.observacoes) ?? undefined,
    historicoInicial: orUndef(row.historico_inicial) ?? undefined,
    motivoPerda: orUndef(row.motivo_perda) ?? undefined,
    convertidoEmCliente: row.convertido_em_cliente,
    clienteConvertidoId: orUndef(row.cliente_convertido_id) ?? undefined,
    openedAt: row.opened_at ?? null,
    historico: [
      {
        id: `hist-${id}-1`,
        data: criadoEm,
        descricao: "Atendimento criado pelo formulário.",
        responsavelId: orUndef(row.corretor_id) ?? undefined,
        tipo: "criacao",
      },
      ...(initial
        ? [
            {
              id: `hist-${id}-2`,
              data: criadoEm,
              descricao: initial,
              responsavelId: orUndef(row.corretor_id) ?? undefined,
              tipo: "observacao" as const,
            },
          ]
        : []),
    ],
    criadoEm,
    atualizadoEm: row.updated_at,
  };
}

function inputToPayload(
  input: AtendimentoCreateInput,
  userId: string,
  options: { legacySchema?: boolean } = {},
) {
  const imovelRef = orNull(input.imovelId);
  const payload: Record<string, unknown> = {
    created_by: userId,
    imobiliaria: input.imobiliaria,
    cliente_id: asUuid(input.clienteId),
    cliente_nome: input.clienteNome.trim(),
    telefone: input.telefone.trim(),
    email: orNull(input.email),
    contato_preferencial: input.contatoPreferencial,
    origem: input.origem,
    finalidade: input.finalidade,
    tipo_imovel: input.tipoImovel,
    dormitorios: orNull(input.dormitorios),
    bairro_interesse: orNull(input.bairroInteresse),
    orcamento_min: num(input.orcamentoMin),
    orcamento_max: num(input.orcamentoMax),
    imovel_id: asUuid(input.imovelId),
    imovel_codigo: orNull(input.imovelCodigo),
    imovel_descricao: imovelRef
      ? orNull(input.imovel?.titulo ?? input.imovelDescricao)
      : options.legacySchema
        ? orNull(input.interesseDescricao)
        : null,
    corretor_id: input.corretorId && input.corretorId !== "a_definir" ? input.corretorId : null,
    corretor_nome:
      input.corretorId && input.corretorId !== "a_definir" ? orNull(input.corretorNome) : null,
    prioridade: input.prioridade,
    status: input.status,
    pipeline_stage: input.pipelineStage ?? statusToPipelineStage(input.status),
    proximo_retorno: input.proximoRetorno ? new Date(input.proximoRetorno).toISOString() : null,
    proximo_passo: orNull(input.proximoPasso),
    observacoes: orNull(input.observacoes),
    historico_inicial: orNull(input.historicoInicial),
    motivo_perda: input.status === "perdido" ? orNull(input.motivoPerda) : null,
    convertido_em_cliente: Boolean(input.clienteId),
    cliente_convertido_id: asUuid(input.clienteId),
  };

  if (!options.legacySchema) {
    payload.imovel_ref = imovelRef;
    payload.interesse_descricao = orNull(input.interesseDescricao);
    payload.imovel_endereco = imovelRef ? orNull(input.imovel?.endereco) : null;
    payload.imovel_bairro = imovelRef ? orNull(input.imovel?.bairro) : null;
    payload.imovel_cidade = imovelRef ? orNull(input.imovel?.cidade) : null;
    payload.imovel_tipo = imovelRef ? orNull(input.imovel?.tipo) : null;
    payload.imovel_valor = imovelRef ? num(input.imovel?.valor) : null;
  }

  return payload;
}

function isExtendedAttendanceSchemaMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    message.includes("imovel_ref") ||
    message.includes("interesse_descricao") ||
    message.includes("imovel_endereco") ||
    message.includes("imovel_valor")
  );
}

function validate(input: AtendimentoCreateInput) {
  if (!input.clienteNome?.trim()) throw new Error("Informe o nome do contato.");
  if (!input.telefone?.trim() || input.telefone.replace(/\D/g, "").length < 10)
    throw new Error("Informe um telefone válido.");
  if (!input.imobiliaria) throw new Error("Selecione a imobiliária.");
  if (!input.finalidade) throw new Error("Selecione a finalidade.");
  if (!input.tipoImovel) throw new Error("Selecione o tipo de imóvel.");
  if (!input.status) throw new Error("Selecione o status.");
  if (!input.prioridade) throw new Error("Selecione a prioridade.");
  if (
    typeof input.orcamentoMin === "number" &&
    typeof input.orcamentoMax === "number" &&
    input.orcamentoMin > input.orcamentoMax
  )
    throw new Error("Orçamento mínimo maior que o máximo.");
}

type StageHistoryRow = {
  attendance_id: string;
  actor_id: string | null;
  actor_name: string | null;
  previous_value: unknown;
  new_value: unknown;
  source: string | null;
  created_at: string;
};

function historyStage(value: unknown): PipelineStage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const stage = (value as Record<string, unknown>).pipeline_stage;
  return typeof stage === "string" ? (stage as PipelineStage) : null;
}

function latestStageTransitions(rows: StageHistoryRow[]) {
  const result = new Map<string, AtendimentoStageTransition>();
  for (const row of rows) {
    if (result.has(row.attendance_id)) continue;
    const to = historyStage(row.new_value);
    if (!to) continue;
    result.set(row.attendance_id, {
      from: historyStage(row.previous_value),
      to,
      at: row.created_at,
      actorId: orUndef(row.actor_id),
      actorName: orUndef(row.actor_name),
      source: row.source ?? "trigger",
    });
  }
  return result;
}

export const listAttendances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isAdmin }, { data: isSecretaria }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "secretaria" }),
    ]);
    let query = context.supabase
      .from("attendances")
      .select("*")
      .order("created_at", { ascending: false });
    if (!isAdmin && !isSecretaria) {
      query = query.or(`created_by.eq.${context.userId},corretor_id.eq.${context.userId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DbRow[];
    if (rows.length === 0) return [];

    const { data: historyRows, error: historyError } = await context.supabase
      .from("attendance_history")
      .select("attendance_id, actor_id, actor_name, previous_value, new_value, source, created_at")
      .in(
        "attendance_id",
        rows.map((row) => row.id),
      )
      .eq("event_type", "stage_change")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(rows.length * 12, 100), 1000));
    if (historyError) throw new Error(historyError.message);

    const transitions = latestStageTransitions((historyRows ?? []) as unknown as StageHistoryRow[]);
    return rows.map((row) => rowToAtendimento(row, transitions.get(row.id)));
  });

export type AttendanceBrokerOption = {
  id: string;
  nome: string;
};

export const listAttendanceBrokers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AttendanceBrokerOption[]> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id,nome")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; nome: string }>).map((profile) => ({
      id: profile.id,
      nome: profile.nome,
    }));
  });

export const createAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AtendimentoCreateInput) => d)
  .handler(async ({ data, context }) => {
    validate(data);
    let { data: inserted, error } = await context.supabase
      .from("attendances")
      .insert(inputToPayload(data, context.userId) as never)
      .select("*")
      .single();
    if (isExtendedAttendanceSchemaMissing(error)) {
      const legacyResult = await context.supabase
        .from("attendances")
        .insert(inputToPayload(data, context.userId, { legacySchema: true }) as never)
        .select("*")
        .single();
      inserted = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw new Error(error.message);
    return rowToAtendimento(inserted as unknown as DbRow);
  });

type UpdateInput = {
  id: string;
  patch: AtendimentoUpdatePatch;
};

export const updateAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpdateInput) => d)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    const p = data.patch;
    if (p.clienteId !== undefined) patch.cliente_id = asUuid(p.clienteId);
    if (p.clienteNome !== undefined) patch.cliente_nome = p.clienteNome.trim();
    if (p.telefone !== undefined) patch.telefone = p.telefone.trim();
    if (p.email !== undefined) patch.email = orNull(p.email);
    if (p.contatoPreferencial !== undefined) patch.contato_preferencial = p.contatoPreferencial;
    if (p.origem !== undefined) patch.origem = p.origem;
    if (p.imobiliaria !== undefined) patch.imobiliaria = p.imobiliaria;
    if (p.finalidade !== undefined) patch.finalidade = p.finalidade;
    if (p.tipoImovel !== undefined) patch.tipo_imovel = p.tipoImovel;
    if (p.dormitorios !== undefined) patch.dormitorios = orNull(p.dormitorios);
    if (p.bairroInteresse !== undefined) patch.bairro_interesse = orNull(p.bairroInteresse);
    if (p.orcamentoMin !== undefined) patch.orcamento_min = num(p.orcamentoMin);
    if (p.orcamentoMax !== undefined) patch.orcamento_max = num(p.orcamentoMax);
    if (p.status !== undefined) patch.status = p.status;
    if (p.pipelineStage !== undefined) patch.pipeline_stage = p.pipelineStage;
    if (p.prioridade !== undefined) patch.prioridade = p.prioridade;
    if (p.convertidoEmCliente !== undefined) patch.convertido_em_cliente = p.convertidoEmCliente;
    if (p.clienteConvertidoId !== undefined)
      patch.cliente_convertido_id = asUuid(p.clienteConvertidoId ?? undefined);
    if (p.motivoPerda !== undefined) patch.motivo_perda = orNull(p.motivoPerda);
    if (p.observacoes !== undefined) patch.observacoes = orNull(p.observacoes);
    if (p.proximoRetorno !== undefined)
      patch.proximo_retorno = p.proximoRetorno ? new Date(p.proximoRetorno).toISOString() : null;
    if (p.proximoPasso !== undefined) patch.proximo_passo = orNull(p.proximoPasso);
    if (p.corretorId !== undefined) patch.corretor_id = orNull(p.corretorId);
    if (p.corretorNome !== undefined) patch.corretor_nome = orNull(p.corretorNome);
    if (p.historicoInicial !== undefined) patch.historico_inicial = orNull(p.historicoInicial);

    const hasPropertyPatch =
      p.imovelId !== undefined ||
      p.imovel !== undefined ||
      p.imovelCodigo !== undefined ||
      p.imovelDescricao !== undefined;
    if (hasPropertyPatch) {
      const propertyRef = orNull(p.imovelId);
      patch.imovel_id = asUuid(p.imovelId);
      patch.imovel_ref = propertyRef;
      patch.imovel_codigo = propertyRef ? orNull(p.imovel?.codigo ?? p.imovelCodigo) : null;
      patch.imovel_descricao = propertyRef ? orNull(p.imovel?.titulo ?? p.imovelDescricao) : null;
      patch.imovel_endereco = propertyRef ? orNull(p.imovel?.endereco) : null;
      patch.imovel_bairro = propertyRef ? orNull(p.imovel?.bairro) : null;
      patch.imovel_cidade = propertyRef ? orNull(p.imovel?.cidade) : null;
      patch.imovel_tipo = propertyRef ? orNull(p.imovel?.tipo) : null;
      patch.imovel_valor = propertyRef ? num(p.imovel?.valor) : null;
    }
    if (p.interesseDescricao !== undefined)
      patch.interesse_descricao = orNull(p.interesseDescricao);

    let { data: updated, error } = await context.supabase
      .from("attendances")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (isExtendedAttendanceSchemaMissing(error)) {
      const legacyPatch = { ...patch };
      delete legacyPatch.imovel_ref;
      delete legacyPatch.interesse_descricao;
      delete legacyPatch.imovel_endereco;
      delete legacyPatch.imovel_bairro;
      delete legacyPatch.imovel_cidade;
      delete legacyPatch.imovel_tipo;
      delete legacyPatch.imovel_valor;
      if (!orNull(p.imovelId) && p.interesseDescricao !== undefined) {
        legacyPatch.imovel_descricao = orNull(p.interesseDescricao);
      }
      const legacyResult = await context.supabase
        .from("attendances")
        .update(legacyPatch as never)
        .eq("id", data.id)
        .select("*")
        .single();
      updated = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw new Error(error.message);
    return rowToAtendimento(updated as unknown as DbRow);
  });

type TransitionStageInput = {
  id: string;
  to: PipelineStage;
};

export const transitionAttendanceStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: TransitionStageInput) => d)
  .handler(async ({ data, context }) => {
    const { data: current, error: currentError } = await context.supabase
      .from("attendances")
      .select("*")
      .eq("id", data.id)
      .single();
    if (currentError) throw new Error(currentError.message);

    const currentRow = current as unknown as DbRow;
    const from =
      (currentRow.pipeline_stage as PipelineStage | null) ??
      statusToPipelineStage(currentRow.status as AtendimentoStatus);
    if (from === data.to) return rowToAtendimento(currentRow);

    const { data: updated, error } = await context.supabase
      .from("attendances")
      .update({ pipeline_stage: data.to } as never)
      .eq("id", data.id)
      .eq("pipeline_stage", from)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (updated) return rowToAtendimento(updated as unknown as DbRow);

    const { data: latest, error: latestError } = await context.supabase
      .from("attendances")
      .select("*")
      .eq("id", data.id)
      .single();
    if (latestError) throw new Error(latestError.message);
    const latestRow = latest as unknown as DbRow;
    if (latestRow.pipeline_stage === data.to) return rowToAtendimento(latestRow);
    throw new Error(
      "A etapa foi alterada por outra pessoa. Os dados foram atualizados; tente novamente.",
    );
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("attendances").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAttendanceOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (
      context.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("mark_attendance_opened", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type AttendanceHistoryEvent = {
  id: string;
  attendanceId: string;
  clientId: string | null;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  description: string | null;
  previousValue: JsonValue;
  newValue: JsonValue;
  metadata: JsonValue;
  source: string;
  createdAt: string;
};

export const listAttendanceHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attendanceId: string }) => d)
  .handler(async ({ data, context }): Promise<AttendanceHistoryEvent[]> => {
    const { data: rows, error } = await (
      context.supabase as never as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
            };
          };
        };
      }
    )
      .from("attendance_history")
      .select("*")
      .eq("attendance_id", data.attendanceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      attendanceId: r.attendance_id as string,
      clientId: (r.client_id as string | null) ?? null,
      eventType: r.event_type as string,
      actorId: (r.actor_id as string | null) ?? null,
      actorName: (r.actor_name as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      previousValue: (r.previous_value as JsonValue) ?? null,
      newValue: (r.new_value as JsonValue) ?? null,
      metadata: (r.metadata as JsonValue) ?? null,
      source: (r.source as string) ?? "trigger",
      createdAt: r.created_at as string,
    }));
  });

export const addAttendanceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attendanceId: string; texto: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (
      context.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("attendance_add_note", { _attendance_id: data.attendanceId, _texto: data.texto });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const digits = (s: string) => s.replace(/\D+/g, "");

export const findClientByContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { phone?: string; email?: string; document?: string }) => d)
  .handler(async ({ data, context }) => {
    const phone = data.phone ? digits(data.phone) : "";
    const email = data.email?.trim().toLowerCase() ?? "";
    const doc = data.document ? digits(data.document) : "";
    if (!phone && !email && !doc)
      return [] as Array<{ id: string; fullName: string; phone: string; email: string | null }>;

    const filters: string[] = [];
    if (phone.length >= 8) filters.push(`phone.ilike.%${phone.slice(-8)}%`);
    if (email) filters.push(`email.ilike.${email}`);
    if (doc) filters.push(`document.ilike.%${doc}%`);

    const { data: rows, error } = await context.supabase
      .from("clients")
      .select("id, full_name, phone, email, document")
      .or(filters.join(","))
      .limit(5);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const rec = r as unknown as {
        id: string;
        full_name: string;
        phone: string;
        email: string | null;
        document: string | null;
      };
      return { id: rec.id, fullName: rec.full_name, phone: rec.phone, email: rec.email };
    });
  });
