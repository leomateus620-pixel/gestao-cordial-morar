import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Agenciamento,
  AgenciamentoChecklist,
  AgenciamentoContatoPreferencial,
  AgenciamentoImobiliaria,
  AgenciamentoInput,
  AgenciamentoOrigem,
  AgenciamentoStatus,
  AgenciamentoTipoImovel,
} from "@/types/agenciamento";

type DbRow = {
  id: string;
  created_by: string;
  imobiliaria: string;
  tipo_imovel: string;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  descricao_imovel: string | null;
  proprietario_nome: string;
  proprietario_telefone: string;
  proprietario_contato_preferencial: string | null;
  proprietario_observacoes: string | null;
  corretor_id: string;
  corretor_nome: string;
  data_agenciamento: string;
  origem: string;
  status: string;
  fotos_realizadas: boolean;
  fotos_drive: boolean;
  placa_instalada: boolean;
  cadastrado_site: boolean;
  video_realizado: boolean;
  validado: boolean;
  drive_folder_url: string | null;
  site_url: string | null;
  observacoes_internas: string | null;
  criado_por_nome: string | null;
  validado_por_id: string | null;
  validado_por_nome: string | null;
  validado_em: string | null;
  created_at: string;
  updated_at: string;
};

const orNull = (v?: string | null) =>
  v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;
const orUndef = (v: string | null) => (v ?? undefined) as string | undefined;

function rowToAgenciamento(row: DbRow): Agenciamento {
  return {
    id: row.id,
    tipoImovel: row.tipo_imovel as AgenciamentoTipoImovel,
    endereco: row.endereco,
    bairro: orUndef(row.bairro),
    cidade: orUndef(row.cidade),
    imobiliaria: row.imobiliaria as AgenciamentoImobiliaria,
    descricaoImovel: orUndef(row.descricao_imovel),
    proprietarioNome: row.proprietario_nome,
    proprietarioTelefone: row.proprietario_telefone,
    proprietarioContatoPreferencial:
      (orUndef(row.proprietario_contato_preferencial) as
        | AgenciamentoContatoPreferencial
        | undefined) ?? "whatsapp",
    proprietarioObservacoes: orUndef(row.proprietario_observacoes),
    corretorId: row.corretor_id,
    corretorNome: row.corretor_nome,
    dataAgenciamento: row.data_agenciamento,
    origem: row.origem as AgenciamentoOrigem,
    status: row.status as AgenciamentoStatus,
    checklist: {
      fotosRealizadas: row.fotos_realizadas,
      fotosDrive: row.fotos_drive,
      placaInstalada: row.placa_instalada,
      cadastradoSite: row.cadastrado_site,
      videoRealizado: row.video_realizado,
      validado: row.validado,
    },
    driveFolderUrl: orUndef(row.drive_folder_url),
    siteUrl: orUndef(row.site_url),
    observacoesInternas: orUndef(row.observacoes_internas),
    criadoPorId: row.created_by,
    criadoPorNome: orUndef(row.criado_por_nome),
    validadoPorId: orUndef(row.validado_por_id),
    validadoPorNome: orUndef(row.validado_por_nome),
    validadoEm: orUndef(row.validado_em),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
  };
}

function inputToPayload(input: AgenciamentoInput, userId: string, userName?: string) {
  const checklist: AgenciamentoChecklist = input.checklist;
  return {
    created_by: userId,
    imobiliaria: input.imobiliaria,
    tipo_imovel: input.tipoImovel,
    endereco: input.endereco.trim(),
    bairro: orNull(input.bairro),
    cidade: orNull(input.cidade),
    descricao_imovel: orNull(input.descricaoImovel),
    proprietario_nome: input.proprietarioNome.trim(),
    proprietario_telefone: input.proprietarioTelefone.trim(),
    proprietario_contato_preferencial: orNull(input.proprietarioContatoPreferencial),
    proprietario_observacoes: orNull(input.proprietarioObservacoes),
    corretor_id: input.corretorId,
    corretor_nome: input.corretorNome,
    data_agenciamento: input.dataAgenciamento.slice(0, 10),
    origem: input.origem,
    status: input.status,
    fotos_realizadas: Boolean(checklist.fotosRealizadas),
    fotos_drive: Boolean(checklist.fotosDrive),
    placa_instalada: Boolean(checklist.placaInstalada),
    cadastrado_site: Boolean(checklist.cadastradoSite),
    video_realizado: Boolean(checklist.videoRealizado),
    validado: Boolean(checklist.validado),
    drive_folder_url: orNull(input.driveFolderUrl),
    site_url: orNull(input.siteUrl),
    observacoes_internas: orNull(input.observacoesInternas),
    criado_por_nome: orNull(userName ?? input.criadoPorNome ?? null),
  };
}

function validate(input: AgenciamentoInput) {
  if (!input.tipoImovel) throw new Error("Informe o tipo do imóvel.");
  if (!input.imobiliaria) throw new Error("Selecione a imobiliária.");
  if (!input.endereco?.trim()) throw new Error("Informe o endereço.");
  if (!input.proprietarioNome?.trim()) throw new Error("Informe o proprietário.");
  if (!input.proprietarioTelefone?.trim() || input.proprietarioTelefone.replace(/\D/g, "").length < 10)
    throw new Error("Informe um telefone válido.");
  if (!input.corretorId?.trim()) throw new Error("Informe o corretor responsável.");
  if (!input.corretorNome?.trim()) throw new Error("Informe o nome do corretor.");
  if (!input.dataAgenciamento?.trim()) throw new Error("Informe a data do agenciamento.");
  if (!input.origem) throw new Error("Informe a origem.");
  if (!input.status) throw new Error("Informe o status.");
}

export const listAgenciamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agenciamentos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => rowToAgenciamento(row as unknown as DbRow));
  });

export const createAgenciamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AgenciamentoInput) => d)
  .handler(async ({ data, context }) => {
    validate(data);
    const { data: inserted, error } = await context.supabase
      .from("agenciamentos")
      .insert(inputToPayload(data, context.userId) as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(inserted as unknown as DbRow);
  });

type UpdatePatch = Partial<AgenciamentoInput>;

export const updateAgenciamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: UpdatePatch }) => d)
  .handler(async ({ data, context }) => {
    const p = data.patch;
    const patch: Record<string, unknown> = {};
    if (p.imobiliaria !== undefined) patch.imobiliaria = p.imobiliaria;
    if (p.tipoImovel !== undefined) patch.tipo_imovel = p.tipoImovel;
    if (p.endereco !== undefined) patch.endereco = p.endereco.trim();
    if (p.bairro !== undefined) patch.bairro = orNull(p.bairro);
    if (p.cidade !== undefined) patch.cidade = orNull(p.cidade);
    if (p.descricaoImovel !== undefined) patch.descricao_imovel = orNull(p.descricaoImovel);
    if (p.proprietarioNome !== undefined) patch.proprietario_nome = p.proprietarioNome.trim();
    if (p.proprietarioTelefone !== undefined)
      patch.proprietario_telefone = p.proprietarioTelefone.trim();
    if (p.proprietarioContatoPreferencial !== undefined)
      patch.proprietario_contato_preferencial = orNull(p.proprietarioContatoPreferencial);
    if (p.proprietarioObservacoes !== undefined)
      patch.proprietario_observacoes = orNull(p.proprietarioObservacoes);
    if (p.corretorId !== undefined) patch.corretor_id = p.corretorId;
    if (p.corretorNome !== undefined) patch.corretor_nome = p.corretorNome;
    if (p.dataAgenciamento !== undefined)
      patch.data_agenciamento = p.dataAgenciamento.slice(0, 10);
    if (p.origem !== undefined) patch.origem = p.origem;
    if (p.status !== undefined) patch.status = p.status;
    if (p.driveFolderUrl !== undefined) patch.drive_folder_url = orNull(p.driveFolderUrl);
    if (p.siteUrl !== undefined) patch.site_url = orNull(p.siteUrl);
    if (p.observacoesInternas !== undefined)
      patch.observacoes_internas = orNull(p.observacoesInternas);
    if (p.checklist) {
      const c = p.checklist;
      if (c.fotosRealizadas !== undefined) patch.fotos_realizadas = Boolean(c.fotosRealizadas);
      if (c.fotosDrive !== undefined) patch.fotos_drive = Boolean(c.fotosDrive);
      if (c.placaInstalada !== undefined) patch.placa_instalada = Boolean(c.placaInstalada);
      if (c.cadastradoSite !== undefined) patch.cadastrado_site = Boolean(c.cadastradoSite);
      if (c.videoRealizado !== undefined) patch.video_realizado = Boolean(c.videoRealizado);
      if (c.validado !== undefined) patch.validado = Boolean(c.validado);
    }

    const { data: updated, error } = await context.supabase
      .from("agenciamentos")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(updated as unknown as DbRow);
  });

export const validateAgenciamentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; validadoPorNome?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Somente administradores podem validar agenciamentos.");

    const { data: updated, error } = await context.supabase
      .from("agenciamentos")
      .update({
        validado: true,
        status: "validado",
        validado_por_id: context.userId,
        validado_por_nome: orNull(data.validadoPorNome ?? null),
        validado_em: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(updated as unknown as DbRow);
  });

export const deleteAgenciamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agenciamentos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
