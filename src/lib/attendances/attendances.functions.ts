import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Atendimento,
  AtendimentoCreateInput,
  AtendimentoFinalidade,
  AtendimentoStatus,
  ContatoPreferencialAtendimento,
  DormitoriosAtendimento,
  ImobiliariaAtendimento,
  OrigemLeadAtendimento,
  PrioridadeAtendimento,
  ProximoPassoAtendimento,
  TipoImovelInteresse,
} from "@/types/atendimento";

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
  imovel_descricao: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  prioridade: string;
  status: string;
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
const num = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number(v);
const orUndef = <T,>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

function rowToAtendimento(row: DbRow): Atendimento {
  const id = row.id;
  const criadoEm = row.created_at;
  const initial = row.historico_inicial?.trim();
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
    imovelId: orUndef(row.imovel_id) ?? undefined,
    imovelDescricao: orUndef(row.imovel_descricao) ?? undefined,
    prioridade: row.prioridade as PrioridadeAtendimento,
    status: row.status as AtendimentoStatus,
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

function inputToPayload(input: AtendimentoCreateInput, userId: string) {
  return {
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
    imovel_descricao: orNull(input.imovelDescricao),
    corretor_id:
      input.corretorId && input.corretorId !== "a_definir" ? input.corretorId : null,
    corretor_nome:
      input.corretorId && input.corretorId !== "a_definir" ? orNull(input.corretorNome) : null,
    prioridade: input.prioridade,
    status: input.status,
    proximo_retorno: input.proximoRetorno
      ? new Date(input.proximoRetorno).toISOString()
      : null,
    proximo_passo: orNull(input.proximoPasso),
    observacoes: orNull(input.observacoes),
    historico_inicial: orNull(input.historicoInicial),
    motivo_perda: input.status === "perdido" ? orNull(input.motivoPerda) : null,
    convertido_em_cliente: Boolean(input.clienteId),
    cliente_convertido_id: asUuid(input.clienteId),
  };
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

export const listAttendances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    let query = context.supabase
      .from("attendances")
      .select("*")
      .order("created_at", { ascending: false });
    if (!isAdmin) {
      query = query.or(`created_by.eq.${context.userId},corretor_id.eq.${context.userId}`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => rowToAtendimento(row as unknown as DbRow));
  });

export const createAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AtendimentoCreateInput) => d)
  .handler(async ({ data, context }) => {
    validate(data);
    const { data: inserted, error } = await context.supabase
      .from("attendances")
      .insert(inputToPayload(data, context.userId))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAtendimento(inserted as unknown as DbRow);
  });

type UpdateInput = {
  id: string;
  patch: Partial<{
    status: AtendimentoStatus;
    convertidoEmCliente: boolean;
    clienteConvertidoId: string | null;
    motivoPerda: string | null;
    observacoes: string | null;
    proximoRetorno: string | null;
    proximoPasso: ProximoPassoAtendimento | null;
    corretorId: string | null;
    corretorNome: string | null;
  }>;
};

export const updateAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: UpdateInput) => d)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    const p = data.patch;
    if (p.status !== undefined) patch.status = p.status;
    if (p.convertidoEmCliente !== undefined)
      patch.convertido_em_cliente = p.convertidoEmCliente;
    if (p.clienteConvertidoId !== undefined)
      patch.cliente_convertido_id = asUuid(p.clienteConvertidoId ?? undefined);
    if (p.motivoPerda !== undefined) patch.motivo_perda = orNull(p.motivoPerda);
    if (p.observacoes !== undefined) patch.observacoes = orNull(p.observacoes);
    if (p.proximoRetorno !== undefined)
      patch.proximo_retorno = p.proximoRetorno
        ? new Date(p.proximoRetorno).toISOString()
        : null;
    if (p.proximoPasso !== undefined) patch.proximo_passo = orNull(p.proximoPasso);
    if (p.corretorId !== undefined) patch.corretor_id = orNull(p.corretorId);
    if (p.corretorNome !== undefined) patch.corretor_nome = orNull(p.corretorNome);

    const { data: updated, error } = await context.supabase
      .from("attendances")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAtendimento(updated as unknown as DbRow);
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("attendances")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAttendanceOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    }).rpc("mark_attendance_opened", { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

