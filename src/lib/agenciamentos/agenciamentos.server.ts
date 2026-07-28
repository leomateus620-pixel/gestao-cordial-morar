import type { SupabaseClient } from "@supabase/supabase-js";
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

export type AgenciamentoDbRow = {
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

type UserRole = "admin" | "secretaria" | "corretor" | "financeiro";

type UserProfileRow = {
  nome: string | null;
  iniciais: string | null;
};

const MANAGEMENT_ROLES = new Set<UserRole>(["admin", "secretaria"]);

const orNull = (value?: string | null) =>
  value !== undefined && value !== null && String(value).trim() ? String(value).trim() : null;

const orUndef = (value: string | null) => (value ?? undefined) as string | undefined;

export function rowToAgenciamento(row: AgenciamentoDbRow): Agenciamento {
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

export function validateAgenciamentoInput(input: AgenciamentoInput) {
  if (!input.tipoImovel) throw new Error("Informe o tipo do imóvel.");
  if (!input.imobiliaria) throw new Error("Selecione a imobiliária.");
  if (!input.endereco?.trim()) throw new Error("Informe o endereço.");
  if (!input.proprietarioNome?.trim()) throw new Error("Informe o proprietário.");
  if (!input.proprietarioTelefone?.trim() || input.proprietarioTelefone.replace(/\D/g, "").length < 10) {
    throw new Error("Informe um telefone válido.");
  }
  if (!input.corretorId?.trim()) throw new Error("Informe o corretor responsável.");
  if (!input.corretorNome?.trim()) throw new Error("Informe o nome do corretor.");
  if (!input.dataAgenciamento?.trim()) throw new Error("Informe a data do agenciamento.");
  if (!input.origem) throw new Error("Informe a origem.");
  if (!input.status) throw new Error("Informe o status.");
}

export async function getUserRoles(supabase: SupabaseClient, userId: string): Promise<UserRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.role as UserRole);
}

export function canManageAgenciamentos(roles: UserRole[]) {
  return roles.some((role) => MANAGEMENT_ROLES.has(role));
}

export async function getUserDisplayName(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("nome,iniciais")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const profile = data as UserProfileRow | null;
  return profile?.nome?.trim() || profile?.iniciais?.trim() || "Corretor";
}

export function inputToPayload(
  input: AgenciamentoInput,
  userId: string,
  userName: string,
  canManage: boolean,
) {
  const checklist: AgenciamentoChecklist = input.checklist;
  const brokerId = canManage ? input.corretorId : userId;
  const brokerName = canManage ? input.corretorNome : userName;
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
    corretor_id: brokerId,
    corretor_nome: brokerName,
    data_agenciamento: input.dataAgenciamento.slice(0, 10),
    origem: input.origem,
    status: canManage && checklist.validado ? "validado" : input.status,
    fotos_realizadas: Boolean(checklist.fotosRealizadas),
    fotos_drive: Boolean(checklist.fotosDrive),
    placa_instalada: Boolean(checklist.placaInstalada),
    cadastrado_site: Boolean(checklist.cadastradoSite),
    video_realizado: Boolean(checklist.videoRealizado),
    validado: canManage ? Boolean(checklist.validado) : false,
    drive_folder_url: orNull(input.driveFolderUrl),
    site_url: orNull(input.siteUrl),
    observacoes_internas: orNull(input.observacoesInternas),
    criado_por_nome: userName,
  };
}

export function patchToPayload(patchInput: Partial<AgenciamentoInput>, canManage: boolean) {
  const patch: Record<string, unknown> = {};
  if (patchInput.imobiliaria !== undefined) patch.imobiliaria = patchInput.imobiliaria;
  if (patchInput.tipoImovel !== undefined) patch.tipo_imovel = patchInput.tipoImovel;
  if (patchInput.endereco !== undefined) patch.endereco = patchInput.endereco.trim();
  if (patchInput.bairro !== undefined) patch.bairro = orNull(patchInput.bairro);
  if (patchInput.cidade !== undefined) patch.cidade = orNull(patchInput.cidade);
  if (patchInput.descricaoImovel !== undefined) {
    patch.descricao_imovel = orNull(patchInput.descricaoImovel);
  }
  if (patchInput.proprietarioNome !== undefined) {
    patch.proprietario_nome = patchInput.proprietarioNome.trim();
  }
  if (patchInput.proprietarioTelefone !== undefined) {
    patch.proprietario_telefone = patchInput.proprietarioTelefone.trim();
  }
  if (patchInput.proprietarioContatoPreferencial !== undefined) {
    patch.proprietario_contato_preferencial = orNull(patchInput.proprietarioContatoPreferencial);
  }
  if (patchInput.proprietarioObservacoes !== undefined) {
    patch.proprietario_observacoes = orNull(patchInput.proprietarioObservacoes);
  }
  if (canManage && patchInput.corretorId !== undefined) patch.corretor_id = patchInput.corretorId;
  if (canManage && patchInput.corretorNome !== undefined) patch.corretor_nome = patchInput.corretorNome;
  if (patchInput.dataAgenciamento !== undefined) {
    patch.data_agenciamento = patchInput.dataAgenciamento.slice(0, 10);
  }
  if (patchInput.origem !== undefined) patch.origem = patchInput.origem;
  if (patchInput.status !== undefined) {
    patch.status = !canManage && patchInput.status === "validado" ? "em_andamento" : patchInput.status;
  }
  if (patchInput.driveFolderUrl !== undefined) patch.drive_folder_url = orNull(patchInput.driveFolderUrl);
  if (patchInput.siteUrl !== undefined) patch.site_url = orNull(patchInput.siteUrl);
  if (patchInput.observacoesInternas !== undefined) {
    patch.observacoes_internas = orNull(patchInput.observacoesInternas);
  }
  if (patchInput.checklist) {
    const checklist = patchInput.checklist;
    if (checklist.fotosRealizadas !== undefined) {
      patch.fotos_realizadas = Boolean(checklist.fotosRealizadas);
    }
    if (checklist.fotosDrive !== undefined) patch.fotos_drive = Boolean(checklist.fotosDrive);
    if (checklist.placaInstalada !== undefined) {
      patch.placa_instalada = Boolean(checklist.placaInstalada);
    }
    if (checklist.cadastradoSite !== undefined) {
      patch.cadastrado_site = Boolean(checklist.cadastradoSite);
    }
    if (checklist.videoRealizado !== undefined) patch.video_realizado = Boolean(checklist.videoRealizado);
    if (canManage && checklist.validado !== undefined) patch.validado = Boolean(checklist.validado);
  }
  return patch;
}