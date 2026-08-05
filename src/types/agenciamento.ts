export type AgenciamentoStatus =
  | "novo"
  | "em_andamento"
  | "pendente_fotos"
  | "pendente_placa"
  | "pendente_site"
  | "aguardando_validacao"
  | "validado"
  | "reprovado"
  | "cancelado";

export type AgenciamentoImobiliaria = "cordial" | "morar" | "ambas";

export type AgenciamentoFinalidade = "venda" | "aluguel";

export type AgenciamentoFinalidadeFilter = "todas" | AgenciamentoFinalidade | "sem_classificacao";

export type AgenciamentoBonusStatus = "pendente" | "aprovada" | "paga" | "cancelada";

export type AgenciamentoBonus = {
  id: string;
  corretorId: string;
  corretorNome?: string;
  categoria: AgenciamentoFinalidade;
  periodoRef?: string;
  nivel: number;
  listingsCount: number;
  placasCount: number;
  status: AgenciamentoBonusStatus;
  conquistadoEm: string;
};

export type AgenciamentoTipoImovel =
  | "casa"
  | "apartamento"
  | "terreno"
  | "sala_comercial"
  | "area_rural"
  | "predio"
  | "outro";

export type AgenciamentoOrigem =
  | "indicacao"
  | "prospeccao_ativa"
  | "cliente_antigo"
  | "site"
  | "whatsapp"
  | "presencial"
  | "outro";

export type AgenciamentoContatoPreferencial = "whatsapp" | "ligacao" | "email";

export type AgenciamentoChecklist = {
  fotosHorizontal: boolean;
  fotosVertical: boolean;
  fotosDrive: boolean;
  placaInstalada: boolean;
  cadastradoMorar: boolean;
  cadastradoCordial: boolean;
  videoRealizado: boolean;
  validado: boolean;
};

export type Agenciamento = {
  id: string;
  tipoImovel: AgenciamentoTipoImovel;
  endereco: string;
  bairro?: string;
  cidade?: string;
  codigoMorar?: string;
  codigoCordial?: string;

  imobiliaria: AgenciamentoImobiliaria;
  finalidade?: AgenciamentoFinalidade;
  descricaoImovel?: string;

  proprietarioNome: string;
  proprietarioTelefone: string;
  proprietarioContatoPreferencial?: AgenciamentoContatoPreferencial;
  proprietarioObservacoes?: string;

  corretorId: string;
  corretorNome: string;
  dataAgenciamento: string;
  origem: AgenciamentoOrigem;
  status: AgenciamentoStatus;

  checklist: AgenciamentoChecklist;

  driveFolderUrl?: string;
  siteUrl?: string;
  observacoesInternas?: string;

  criadoPorId?: string;
  criadoPorNome?: string;
  validadoPorId?: string;
  validadoPorNome?: string;
  validadoEm?: string;
  reprovadoMotivo?: string;
  reprovadoPorId?: string;
  reprovadoPorNome?: string;
  reprovadoEm?: string;

  criadoEm: string;
  atualizadoEm: string;
};

export type AgenciamentoInput = Omit<
  Agenciamento,
  "id" | "criadoEm" | "atualizadoEm" | "validadoEm" | "validadoPorId" | "validadoPorNome"
> & {
  id?: string;
  validadoEm?: string;
  validadoPorId?: string;
  validadoPorNome?: string;
};

export type AgenciamentoPeriodFilter = "todos" | "mes" | "ultimos_30" | "trimestre" | "ano";

export type AgenciamentoStatusFilter =
  | "todos"
  | "novo"
  | "em_andamento"
  | "pendente_fotos"
  | "pendente_placa"
  | "pendente_site"
  | "pendentes"
  | "aguardando_validacao"
  | "validado"
  | "reprovado"
  | "cancelado";

export type AgenciamentoChecklistFilter =
  | "todos"
  | "com_placa"
  | "sem_placa"
  | "com_fotos"
  | "sem_fotos"
  | "no_site"
  | "fora_site"
  | "com_drive"
  | "sem_drive";

export type AgenciamentoFiltersState = {
  imobiliaria: "todas" | Exclude<AgenciamentoImobiliaria, "ambas">;
  status: AgenciamentoStatusFilter;
  periodo: AgenciamentoPeriodFilter;
  corretorId: string;
  tipoImovel: "todos" | AgenciamentoTipoImovel;
  finalidade: AgenciamentoFinalidadeFilter;
  checklist: AgenciamentoChecklistFilter;
  busca: string;
};

export type AgenciamentoSummary = {
  total: number;
  mes: number;
  pendentesValidacao: number;
  fotosDrive: number;
  placasInstaladas: number;
  cadastradosSite: number;
  validados: number;
  checklistCompleto: number;
  percentualChecklistMedio: number;
};

export type AgenciamentoCorretorRanking = {
  corretorId: string;
  corretorNome: string;
  total: number;
  comPlaca: number;
  fotosDrive: number;
  noSite: number;
  validados: number;
  percentualChecklist: number;
};

export type AgenciamentoCorretorStats = {
  agenciamentosFeitos: number;
  agenciamentosComPlaca: number;
  agenciamentosComFotos: number;
  agenciamentosNoSite: number;
  agenciamentosValidados: number;
  percentualChecklist: number;
};

export const agenciamentoTipoOptions: Array<{
  value: AgenciamentoTipoImovel;
  label: string;
}> = [
  { value: "casa", label: "Casa" },
  { value: "apartamento", label: "Apartamento" },
  { value: "terreno", label: "Terreno" },
  { value: "sala_comercial", label: "Sala comercial" },
  { value: "area_rural", label: "Área rural" },
  { value: "predio", label: "Prédio" },
  { value: "outro", label: "Outro" },
];

export const agenciamentoOrigemOptions: Array<{
  value: AgenciamentoOrigem;
  label: string;
}> = [
  { value: "indicacao", label: "Indicação" },
  { value: "prospeccao_ativa", label: "Prospecção ativa" },
  { value: "cliente_antigo", label: "Cliente antigo" },
  { value: "site", label: "Site" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "presencial", label: "Presencial" },
  { value: "outro", label: "Outro" },
];

export const agenciamentoStatusOptions: Array<{
  value: AgenciamentoStatus;
  label: string;
}> = [
  { value: "novo", label: "Novo" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "pendente_fotos", label: "Pendente fotos" },
  { value: "pendente_placa", label: "Pendente placa" },
  { value: "pendente_site", label: "Pendente site" },
  { value: "aguardando_validacao", label: "Aguardando validação" },
  { value: "validado", label: "Validado" },
  { value: "reprovado", label: "Reprovado" },
  { value: "cancelado", label: "Cancelado" },
];
