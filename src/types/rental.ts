export type RentalPropertyType =
  | "casa"
  | "apartamento"
  | "sala_comercial"
  | "terreno"
  | "kitnet"
  | "outro";

export type RentalPropertyStatus =
  | "disponivel"
  | "alugado"
  | "manutencao"
  | "reservado"
  | "inativo";

export type RentalContractStatus =
  | "ativo"
  | "pendente_assinatura"
  | "vencido"
  | "encerrado"
  | "cancelado";

export type RentalPaymentStatus =
  | "em_dia"
  | "vence_hoje"
  | "atrasado"
  | "pago"
  | "pendente";

export type RentalBrand = "cordial" | "morar" | "ambas";

export type RentalGuaranteeType =
  | "sem_garantia"
  | "fiador"
  | "caucao"
  | "seguro_fianca";

export type RentalProperty = {
  id: string;
  apelido: string;
  tipo: RentalPropertyType;
  logradouro: string;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  quartos?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  areaM2?: number | null;
  valorSugerido?: number | null;
  status: RentalPropertyStatus;
  observacoes?: string | null;
  brand: RentalBrand;
  createdAt: string;
  updatedAt: string;
};

export type RentalTenant = {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  telefone: string;
  email?: string | null;
  dataNascimento?: string | null;
  endereco?: string | null;
  profissao?: string | null;
  rendaAproximada?: number | null;
  observacoes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalGuarantor = {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  profissao?: string | null;
  vinculo?: string | null;
  observacoes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalContract = {
  id: string;
  propertyId: string;
  tenantId: string;
  guarantorId?: string | null;
  valorMensal: number;
  valorCaucao?: number | null;
  garantiaTipo: RentalGuaranteeType;
  seguroSeguradora?: string | null;
  seguroApolice?: string | null;
  seguroValorMensal?: number | null;
  dataInicio: string;
  dataFim: string;
  diaVencimento: number;
  status: RentalContractStatus;
  paymentStatus: RentalPaymentStatus;
  proximoVencimento?: string | null;
  dataEncerramento?: string | null;
  observacoes?: string | null;
  brand: RentalBrand;
  createdAt: string;
  updatedAt: string;
};

export type RentalContractGuaranteeItem = {
  id?: string;
  tipo: Exclude<RentalGuaranteeType, "sem_garantia">;
  guarantor: RentalGuarantor | null;
  valorCaucao: number | null;
  seguroSeguradora: string | null;
  seguroApolice: string | null;
  seguroValorMensal: number | null;
  isPrimary: boolean;
};

export type RentalContractFull = RentalContract & {
  property: RentalProperty;
  tenant: RentalTenant; // principal (item 0)
  guarantor?: RentalGuarantor | null; // principal (item 0)
  tenants: RentalTenant[];
  guarantees: RentalContractGuaranteeItem[];
};

export type RentalPropertyInput = Omit<RentalProperty, "id" | "createdAt" | "updatedAt">;
export type RentalTenantInput = Omit<RentalTenant, "id" | "createdAt" | "updatedAt">;
export type RentalGuarantorInput = Omit<RentalGuarantor, "id" | "createdAt" | "updatedAt">;

export type RentalContractTenantInput = {
  existingId?: string | null;
  data?: RentalTenantInput;
};

export type RentalContractGuaranteeInput = {
  tipo: Exclude<RentalGuaranteeType, "sem_garantia">;
  guarantor?: { existingId?: string | null; data?: RentalGuarantorInput } | null;
  valorCaucao?: number | null;
  seguroSeguradora?: string | null;
  seguroApolice?: string | null;
  seguroValorMensal?: number | null;
};

export type RentalContractInput = {
  contractId?: string;
  property: { existingId?: string | null; data?: RentalPropertyInput };
  // Compatibilidade: manter `tenant` para consumidores antigos.
  tenant?: { existingId?: string | null; data?: RentalTenantInput };
  guarantor?: { existingId?: string | null; data?: RentalGuarantorInput } | null;
  // Novas listas (usadas quando presentes; substituem tenant/guarantor).
  tenants?: RentalContractTenantInput[];
  guarantees?: RentalContractGuaranteeInput[];
  valorMensal: number;
  valorCaucao?: number | null;
  garantiaTipo?: RentalGuaranteeType;
  seguroSeguradora?: string | null;
  seguroApolice?: string | null;
  seguroValorMensal?: number | null;
  dataInicio: string;
  dataFim: string;
  diaVencimento: number;
  status: RentalContractStatus;
  paymentStatus?: RentalPaymentStatus;
  proximoVencimento?: string | null;
  observacoes?: string | null;
  brand?: RentalBrand;
};

export type RentalKpis = {
  receitaMensalAtiva: number;
  contratosAtivos: number;
  contratosPendentes: number;
  vencendoEm30: number;
  atrasos: number;
  imoveisDisponiveis: number;
};

export type RentalContractDocument = {
  id: string;
  contractId: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
  createdAt: string;
};

export type RentalFilter =
  | "todos"
  | "ativos"
  | "pendentes"
  | "vencidos"
  | "encerrados"
  | "atrasados";
