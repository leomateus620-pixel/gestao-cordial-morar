import type { RentalContractFull } from "@/types/rental";

export const RECEIPT_COMPANIES = {
  cordial: {
    name: "Cordial Imóveis",
    logo: "/cordial-site/logo.png",
    site: "www.cordialimoveis.com",
  },
  morar: { name: "Morar Imóveis", logo: "/morar-site/logo.jpg", site: "www.cordialimoveis.com" },
};
export const RECEIPT_COMPANY_DETAILS = {
  creci: "CRECI 26.122 J",
  address: "Rua Buriti, n° 139 - Centro",
  city: "CEP: 98780-753 Santa Rosa/RS",
  phone: "55 2021-0199 ou 55 99659-0199",
};
export type ReceiptInput = {
  competencia: string;
  brand: "cordial" | "morar";
  aluguel: number;
  honorarios: number;
  condominio: number;
  iptu: number;
  iptuParcela: string;
  seguroFianca: number;
  observacao: string;
  vencimento: string;
  ajustesInquilino?: TenantAdjustment[];
  ajustesProprietario?: OwnerAdjustment[];
};
export type AdjustmentKind = "desconto" | "acrescimo";
export type TenantAdjustment = {
  id: string;
  tipo: AdjustmentKind;
  descricao: string;
  valor: number;
  repassarProprietario: boolean;
  /** Recurring contract adjustment this line came from (or was saved as). */
  recorrenteId?: string;
  /** UI only: save as a new recurring adjustment. */
  repetir?: boolean;
  /** UI only: optional last competence (AAAA-MM) for a new recurring adjustment. */
  fimCompetencia?: string;
};
export type OwnerAdjustment = {
  id: string;
  tipo: AdjustmentKind;
  descricao: string;
  valor: number;
  comprovantePath?: string;
};
export type RecurringAdjustment = {
  id: string;
  tipo: AdjustmentKind;
  descricao: string;
  valor: number;
  repassarProprietario: boolean;
  inicioCompetencia: string;
  fimCompetencia: string | null;
  ativo: boolean;
};
export const MAX_ADJUSTMENTS_PER_SIDE = 10;
export const NEGATIVE_TOTAL_MESSAGE = "Os descontos não podem deixar o total negativo.";
const cents = (n: number) => Math.round(n * 100);
const signed = (a: { tipo: AdjustmentKind; valor: number }) =>
  a.tipo === "acrescimo" ? cents(a.valor) : -cents(a.valor);
const COMPETENCE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Recurring adjustments that apply to a competence (start ≤ competence ≤ end). */
export function activeRecurringFor(list: RecurringAdjustment[], competencia: string) {
  return list.filter(
    (r) =>
      r.ativo &&
      r.inicioCompetencia <= competencia &&
      (!r.fimCompetencia || r.fimCompetencia >= competencia),
  );
}

export function validateReceiptAdjustments(input: ReceiptInput) {
  const tenant = input.ajustesInquilino ?? [];
  const owner = input.ajustesProprietario ?? [];
  if (tenant.length > MAX_ADJUSTMENTS_PER_SIDE || owner.length > MAX_ADJUSTMENTS_PER_SIDE)
    throw new Error(`Use no máximo ${MAX_ADJUSTMENTS_PER_SIDE} ajustes por lado.`);
  for (const a of [...tenant, ...owner]) {
    const d = a.descricao.trim();
    if (!d) throw new Error("Informe a descrição de cada desconto ou ajuste.");
    if (d.length > 60) throw new Error("Descrição do ajuste com mais de 60 caracteres.");
    if (a.tipo !== "desconto" && a.tipo !== "acrescimo") throw new Error("Tipo de ajuste inválido.");
    if (!Number.isFinite(a.valor) || a.valor <= 0 || a.valor > 99999999)
      throw new Error("O valor de cada ajuste deve ser maior que zero.");
  }
  for (const a of tenant)
    if (a.repetir && a.fimCompetencia) {
      if (!COMPETENCE.test(a.fimCompetencia)) throw new Error("Competência final inválida.");
      if (a.fimCompetencia < input.competencia)
        throw new Error("A repetição não pode terminar antes desta competência.");
    }
}

/** Pure totals in cents → reais. Missing adjustment arrays (legacy receipts) count as empty. */
export function computeReceiptTotals(input: ReceiptInput) {
  const tenant = input.ajustesInquilino ?? [];
  const owner = input.ajustesProprietario ?? [];
  const ajusteInquilino = tenant.reduce((s, a) => s + signed(a), 0);
  const ajusteRepassado = tenant
    .filter((a) => a.repassarProprietario)
    .reduce((s, a) => s + signed(a), 0);
  const ajusteProprietario = owner.reduce((s, a) => s + signed(a), 0);
  const pagar =
    cents(input.aluguel) +
    cents(input.condominio) +
    cents(input.iptu) +
    cents(input.seguroFianca) +
    ajusteInquilino;
  const receber =
    cents(input.aluguel) -
    cents(input.honorarios) +
    cents(input.condominio) +
    ajusteRepassado +
    ajusteProprietario;
  return {
    totalPagar: pagar / 100,
    totalReceber: receber / 100,
    ajusteInquilino: ajusteInquilino / 100,
    ajusteRepassado: ajusteRepassado / 100,
    ajusteProprietario: ajusteProprietario / 100,
  };
}
export function currentRentalCompetence(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}
export function defaultReceiptInput(
  contract: RentalContractFull,
  competencia: string,
  recurring: RecurringAdjustment[] = [],
): ReceiptInput {
  const [year, month] = competencia.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    competencia,
    brand: contract.brand === "morar" ? "morar" : "cordial",
    aluguel: contract.valorMensal,
    honorarios: contract.comissaoMensal ?? 0,
    condominio: 0,
    iptu: 0,
    iptuParcela: "",
    seguroFianca: contract.seguroValorMensal ?? 0,
    observacao: "",
    vencimento: `${competencia}-${String(Math.min(contract.diaVencimento, lastDay)).padStart(2, "0")}`,
    ajustesInquilino: activeRecurringFor(recurring, competencia).map((r) => ({
      id: `rec-${r.id}`,
      tipo: r.tipo,
      descricao: r.descricao,
      valor: r.valor,
      repassarProprietario: r.repassarProprietario,
      recorrenteId: r.id,
    })),
    ajustesProprietario: [],
  };
}
export function buildReceiptModel(contract: RentalContractFull, input: ReceiptInput) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.competencia)) throw new Error("Competência inválida.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.vencimento) ||
    Number.isNaN(new Date(`${input.vencimento}T12:00:00Z`).getTime()) ||
    new Date(`${input.vencimento}T12:00:00Z`).toISOString().slice(0, 10) !== input.vencimento
  )
    throw new Error("Vencimento inválido.");
  for (const n of [
    input.aluguel,
    input.honorarios,
    input.condominio,
    input.iptu,
    input.seguroFianca,
  ]) {
    if (!Number.isFinite(n) || n < 0 || n > 99999999)
      throw new Error("Confira os valores do recibo.");
  }
  if (input.observacao.length > 160 || input.iptuParcela.length > 20)
    throw new Error("Texto do recibo muito longo.");
  validateReceiptAdjustments(input);
  const totals = computeReceiptTotals(input);
  if (totals.totalPagar < 0 || totals.totalReceber < 0) throw new Error(NEGATIVE_TOTAL_MESSAGE);
  const company = RECEIPT_COMPANIES[input.brand];
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
    .format(new Date(`${input.competencia}-01T12:00:00Z`))
    .toUpperCase();
  return {
    ...input,
    company,
    companyDetails: RECEIPT_COMPANY_DETAILS,
    title: `RECIBO REFERENTE A ${month} ${input.competencia.slice(0, 4)}`,
    owner: contract.property.proprietarioNome ?? "Não informado",
    tenant: contract.tenant.nome,
    address: [
      contract.property.logradouro,
      contract.property.numero,
      contract.property.complemento,
      contract.property.bairro,
      contract.property.cidade,
      contract.property.uf,
      contract.property.cep,
    ]
      .filter(Boolean)
      .join(", "),
    ajustesInquilino: input.ajustesInquilino ?? [],
    ajustesProprietario: input.ajustesProprietario ?? [],
    ...totals,
    fileName: `Recibo - ${input.brand === "morar" ? "Morar" : "Cordial"} - ${input.competencia.slice(5)}-${input.competencia.slice(0, 4)}.pdf`,
  };
}
export type ReceiptModel = ReturnType<typeof buildReceiptModel>;
