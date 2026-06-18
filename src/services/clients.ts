import {
  clientPurposeLabel,
  clientStatusLabel,
  clientTypeLabel,
  leadOriginLabel,
  propertyTypeLabel,
  realEstateBrandLabel,
  type BedroomOption,
  type Client,
  type ClientCreateInput,
  type ClientPurpose,
  type ClientStatus,
  type ClientType,
  type LeadOrigin,
  type PropertyType,
  type RealEstateBrand,
} from "@/types/client";
import type { AgencyId, Cliente, OrigemLead } from "@/lib/mock/data";

type LegacyClient = Partial<Client> & {
  id?: string;
  nome?: string;
  iniciais?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  tipo?: string;
  interesse?: string;
  orcamento?: number;
  perfilBusca?: string;
  origem?: OrigemLead;
  faixaValor?: { minimo: number; maximo: number };
  bairros?: string[];
  historico?: Cliente["historico"];
  documentos?: Cliente["documentos"];
  lembretes?: Cliente["lembretes"];
  timeline?: Cliente["timeline"];
  imobiliaria?: AgencyId;
  criadoEm?: string;
  documento?: string;
  rendaMensal?: number;
  preferenciaContato?: "WhatsApp" | "Telefone" | "E-mail";
  observacoes?: string;
};

export type ClientValidationResult = {
  ok: boolean;
  errors: Partial<Record<keyof ClientCreateInput | "budget", string>>;
};

const generatedId = () => Math.random().toString(36).slice(2, 10);

export function getClientInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

export function createClientRecord(input: ClientCreateInput, now = new Date()): Client {
  const timestamp = now.toISOString();
  return {
    ...input,
    id: generatedId(),
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createStoreClientRecord(input: ClientCreateInput, now = new Date()): Cliente {
  return clientToStoreRecord(createClientRecord(input, now));
}

export function normalizeStoreClient(raw: Client | LegacyClient): Cliente {
  return clientToStoreRecord(normalizeClient(raw), raw as LegacyClient);
}

export function normalizeClient(raw: Client | LegacyClient): Client {
  const maybeClient = raw as Partial<Client>;
  if (maybeClient.fullName) {
    return {
      id: maybeClient.id ?? generatedId(),
      fullName: maybeClient.fullName,
      phone: maybeClient.phone ?? "",
      email: maybeClient.email || undefined,
      clientType: maybeClient.clientType ?? "comprador",
      contactPreference: maybeClient.contactPreference ?? "whatsapp",
      leadOrigin: maybeClient.leadOrigin ?? "whatsapp",
      brand: maybeClient.brand ?? "cordial",
      assignedBrokerId: maybeClient.assignedBrokerId,
      assignedBrokerName: maybeClient.assignedBrokerName,
      purpose: maybeClient.purpose ?? "compra",
      propertyType: maybeClient.propertyType ?? "apartamento",
      bedrooms: maybeClient.bedrooms,
      neighborhood: maybeClient.neighborhood,
      minBudget: maybeClient.minBudget,
      maxBudget: maybeClient.maxBudget,
      approximateIncome: maybeClient.approximateIncome,
      document: maybeClient.document,
      profession: maybeClient.profession,
      notes: maybeClient.notes,
      restrictions: maybeClient.restrictions,
      nextStep: maybeClient.nextStep,
      nextFollowUpAt: maybeClient.nextFollowUpAt,
      status: maybeClient.status ?? "novo",
      createdAt: maybeClient.createdAt ?? new Date().toISOString(),
      updatedAt: maybeClient.updatedAt ?? maybeClient.createdAt ?? new Date().toISOString(),
    };
  }

  const legacy = raw as LegacyClient;
  const budget = Number(legacy.orcamento ?? 0);
  const rangeMin = legacy.faixaValor?.minimo ?? (budget > 0 ? budget : undefined);
  const rangeMax = legacy.faixaValor?.maximo ?? (budget > 0 ? budget : undefined);

  return {
    id: legacy.id ?? generatedId(),
    fullName: legacy.nome?.trim() || "Cliente sem nome",
    phone: legacy.telefone ?? "",
    email: legacy.email || undefined,
    clientType: mapLegacyClientType(legacy.tipo),
    contactPreference: mapLegacyContactPreference(legacy.preferenciaContato),
    leadOrigin: mapLegacyLeadOrigin(legacy.origem),
    brand: legacy.imobiliaria ?? "cordial",
    assignedBrokerName: undefined,
    purpose: mapLegacyPurpose(legacy.tipo),
    propertyType: inferPropertyType(legacy.interesse),
    bedrooms: inferBedrooms(legacy.interesse),
    neighborhood: legacy.bairros?.join(", ") ?? inferNeighborhood(legacy.interesse),
    minBudget: rangeMin,
    maxBudget: rangeMax,
    approximateIncome: legacy.rendaMensal,
    document: legacy.documento,
    notes: legacy.observacoes ?? legacy.perfilBusca ?? legacy.interesse,
    status: "novo",
    createdAt: legacy.criadoEm ?? new Date().toISOString(),
    updatedAt: legacy.criadoEm ?? new Date().toISOString(),
  };
}

export function validateClientInput(input: ClientCreateInput): ClientValidationResult {
  const errors: ClientValidationResult["errors"] = {};

  if (!input.fullName.trim()) errors.fullName = "Informe o nome completo.";
  if (!input.phone.trim()) errors.phone = "Informe o telefone.";
  if (!input.clientType) errors.clientType = "Selecione o tipo de cliente.";
  if (!input.leadOrigin) errors.leadOrigin = "Selecione a origem.";
  if (!input.brand) errors.brand = "Selecione a imobiliária.";
  if (!input.purpose) errors.purpose = "Selecione a finalidade.";
  if (!input.propertyType) errors.propertyType = "Selecione o tipo de imóvel.";
  if (!input.status) errors.status = "Selecione o status.";

  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.email = "Informe um e-mail válido.";
  }

  if (
    typeof input.minBudget === "number" &&
    typeof input.maxBudget === "number" &&
    input.minBudget > input.maxBudget
  ) {
    errors.budget = "O orçamento mínimo não pode ser maior que o máximo.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function clientMatchesBrand(client: Client, brand: "todas" | "cordial" | "morar") {
  if (brand === "todas") return true;
  return client.brand === brand || client.brand === "ambas";
}

export function clientMatchesSearch(client: Client, query: string) {
  const q = normalizeSearch(query);
  if (!q) return true;

  const haystack = [
    client.fullName,
    client.phone,
    client.email,
    client.neighborhood,
    propertyTypeLabel(client.propertyType),
    client.assignedBrokerName,
    leadOriginLabel(client.leadOrigin),
    clientTypeLabel(client.clientType),
  ]
    .filter(Boolean)
    .map(String)
    .join(" ");

  return normalizeSearch(haystack).includes(q);
}

export function formatPhoneBR(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function parseCurrencyBR(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return undefined;
  return Number(digits);
}

export function formatCurrencyBR(value: string | number | undefined) {
  const numeric = typeof value === "number" ? value : parseCurrencyBR(value ?? "");
  if (!numeric) return "";
  return numeric.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatBudgetRange(client: Client) {
  if (client.minBudget && client.maxBudget && client.minBudget !== client.maxBudget) {
    return `${formatCurrencyBR(client.minBudget)} - ${formatCurrencyBR(client.maxBudget)}`;
  }

  const value = client.maxBudget ?? client.minBudget;
  return value ? formatCurrencyBR(value) : "A combinar";
}

export function isClientCreatedThisMonth(client: Client, reference = new Date()) {
  const created = new Date(client.createdAt);
  return (
    created.getFullYear() === reference.getFullYear() && created.getMonth() === reference.getMonth()
  );
}

export function clientSummaryLine(client: Client) {
  const bedroom =
    client.bedrooms && client.bedrooms !== "nao_aplica" ? ` · ${client.bedrooms} dorm.` : "";
  const region = client.neighborhood ? ` · ${client.neighborhood}` : "";
  return `${propertyTypeLabel(client.propertyType)}${bedroom}${region}`;
}

export function clientCommercialText(client: Client) {
  return [
    clientTypeLabel(client.clientType),
    clientPurposeLabel(client.purpose),
    clientStatusLabel(client.status),
    realEstateBrandLabel(client.brand),
  ].join(" · ");
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function mapLegacyClientType(tipo?: string): ClientType {
  const normalized = normalizeSearch(tipo ?? "");
  if (normalized.includes("locat")) return "locatario";
  if (normalized.includes("propriet")) return "proprietario";
  if (normalized.includes("invest")) return "investidor";
  return "comprador";
}

function mapLegacyPurpose(tipo?: string): ClientPurpose {
  const normalized = normalizeSearch(tipo ?? "");
  if (normalized.includes("locat")) return "aluguel";
  if (normalized.includes("propriet")) return "aluguel";
  return "compra";
}

function clientToStoreRecord(client: Client, legacy: LegacyClient = {}): Cliente {
  const budget = client.maxBudget ?? client.minBudget ?? legacy.orcamento ?? 0;
  const agency = brandToAgency(client.brand, legacy.imobiliaria);

  return {
    ...legacy,
    ...client,
    id: client.id,
    nome: legacy.nome ?? client.fullName,
    iniciais: legacy.iniciais ?? getClientInitials(client.fullName),
    telefone: legacy.telefone ?? client.phone,
    whatsapp: legacy.whatsapp ?? client.phone,
    email: legacy.email ?? client.email ?? "",
    tipo: (legacy.tipo as Cliente["tipo"] | undefined) ?? mapClientTypeToLegacy(client.clientType),
    interesse: legacy.interesse ?? buildInterestText(client),
    orcamento: budget,
    perfilBusca: legacy.perfilBusca ?? client.notes,
    origem: legacy.origem ?? mapLeadOriginToLegacy(client.leadOrigin),
    faixaValor:
      legacy.faixaValor ??
      (client.minBudget || client.maxBudget
        ? { minimo: client.minBudget ?? budget, maximo: client.maxBudget ?? budget }
        : undefined),
    bairros: legacy.bairros ?? (client.neighborhood ? [client.neighborhood] : undefined),
    historico: legacy.historico ?? buildInitialHistory(client),
    documentos: legacy.documentos,
    lembretes: legacy.lembretes ?? buildFollowUpReminder(client),
    timeline: legacy.timeline ?? [
      {
        data: client.createdAt.slice(0, 10),
        etapa: "Lead criado",
        detalhe: "Cadastro criado pela central comercial de clientes.",
      },
    ],
    imobiliaria: agency,
    criadoEm: legacy.criadoEm ?? client.createdAt,
    documento: legacy.documento ?? client.document,
    rendaMensal: legacy.rendaMensal ?? client.approximateIncome,
    preferenciaContato:
      legacy.preferenciaContato ?? mapContactPreferenceToLegacy(client.contactPreference),
    observacoes: legacy.observacoes ?? client.notes,
  };
}

function mapClientTypeToLegacy(type: ClientType): Cliente["tipo"] {
  if (type === "locatario") return "Locatário";
  if (type === "proprietario") return "Proprietário";
  return "Comprador";
}

function mapContactPreferenceToLegacy(preference: Client["contactPreference"]) {
  if (preference === "ligacao") return "Telefone";
  if (preference === "email") return "E-mail";
  return "WhatsApp";
}

function mapLegacyContactPreference(preference?: LegacyClient["preferenciaContato"]) {
  if (preference === "Telefone") return "ligacao";
  if (preference === "E-mail") return "email";
  return "whatsapp";
}

function mapLeadOriginToLegacy(origin: LeadOrigin): OrigemLead {
  if (origin === "instagram") return "Instagram";
  if (origin === "indicacao") return "Indicação";
  if (origin === "site") return "Site";
  if (origin === "portal") return "Portal imobiliário";
  if (origin === "presencial") return "Captação ativa";
  if (origin === "outro") return "Carteira antiga";
  return "WhatsApp";
}

function mapLegacyLeadOrigin(origin?: OrigemLead): LeadOrigin {
  const normalized = normalizeSearch(origin ?? "");
  if (normalized.includes("instagram")) return "instagram";
  if (normalized.includes("indic")) return "indicacao";
  if (normalized.includes("site")) return "site";
  if (normalized.includes("portal")) return "portal";
  if (
    normalized.includes("captacao") ||
    normalized.includes("placa") ||
    normalized.includes("porta")
  ) {
    return "presencial";
  }
  if (
    normalized.includes("google") ||
    normalized.includes("facebook") ||
    normalized.includes("carteira")
  ) {
    return "outro";
  }
  return "whatsapp";
}

function brandToAgency(brand: RealEstateBrand, fallback?: AgencyId): AgencyId {
  if (brand === "morar") return "morar";
  if (brand === "cordial") return "cordial";
  return fallback ?? "cordial";
}

function buildInterestText(client: Client) {
  const bedroom =
    client.bedrooms && client.bedrooms !== "nao_aplica" ? ` ${client.bedrooms} dorm.` : "";
  const region = client.neighborhood ? ` em ${client.neighborhood}` : "";
  return `${propertyTypeLabel(client.propertyType)}${bedroom}${region}`.trim();
}

function buildInitialHistory(client: Client): Cliente["historico"] {
  if (!client.notes) return undefined;
  return [
    {
      data: client.createdAt,
      tipo: "Observação",
      descricao: client.notes,
      responsavelId: client.assignedBrokerId ?? "ricardo",
    },
  ];
}

function buildFollowUpReminder(client: Client): Cliente["lembretes"] {
  if (!client.nextFollowUpAt) return undefined;
  return [
    {
      id: `lem-${client.id}-1`,
      data: client.nextFollowUpAt,
      titulo: client.nextStep ?? "Retornar contato",
      concluido: false,
    },
  ];
}

function inferPropertyType(interesse?: string): PropertyType {
  const normalized = normalizeSearch(interesse ?? "");
  if (normalized.includes("casa")) return "casa";
  if (normalized.includes("terreno")) return "terreno";
  if (normalized.includes("sala")) return "sala_comercial";
  if (normalized.includes("rural")) return "area_rural";
  return "apartamento";
}

function inferBedrooms(interesse?: string): BedroomOption | undefined {
  const match = normalizeSearch(interesse ?? "").match(/([1-4])\s*(quarto|dorm)/);
  if (!match?.[1]) return undefined;
  return match[1] === "4" ? "4+" : (match[1] as BedroomOption);
}

function inferNeighborhood(interesse?: string) {
  const text = interesse?.trim();
  if (!text) return undefined;
  const parts = text.split(/\s+/);
  return parts.length > 2 ? parts.slice(-2).join(" ") : undefined;
}
