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
};
const cents = (n: number) => Math.round(n * 100);
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
    totalPagar:
      (cents(input.aluguel) +
        cents(input.iptu) +
        cents(input.seguroFianca) +
        cents(input.condominio)) /
      100,
    totalReceber: (cents(input.aluguel) - cents(input.honorarios) + cents(input.condominio)) / 100,
    fileName: `Recibo - ${input.brand === "morar" ? "Morar" : "Cordial"} - ${input.competencia.slice(5)}-${input.competencia.slice(0, 4)}.pdf`,
  };
}
export type ReceiptModel = ReturnType<typeof buildReceiptModel>;
