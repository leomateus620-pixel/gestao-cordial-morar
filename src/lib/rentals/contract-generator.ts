/**
 * Montagem pura da minuta de contrato de locação a partir dos modelos
 * aprovados (Cordial/Morar × fiador/caução/seguro-fiança) e da cláusula
 * da seguradora escolhida. Sem rede, sem banco: testável.
 */
import { moneyWithWords } from "./money-extenso";

export type ContractBrand = "cordial" | "morar";
export type ContractGuarantee = "fiador" | "caucao" | "seguro_fianca";

export const MISSING_PREFIX = "[PREENCHER:";

export type ContractSpouse = { papel: "esposa" | "conjuge"; nome: string; qualificacao: string };
export type ContractParty = { label: string; qualificacao: string; conjuge?: ContractSpouse | null };

export type ContractInsurer = {
  id: string;
  nome: string;
  brands: string[];
  clauseTemplate: string;
  active: boolean;
};

export type ContractData = {
  brand: ContractBrand;
  guarantee: ContractGuarantee;
  locador: ContractParty;
  locatarios: ContractParty[];
  fiadores: ContractParty[];
  imovelEndereco: string;
  matricula: string;
  bensFiadores: string;
  dataInicio: string; // ISO yyyy-mm-dd
  dataAssinatura: string; // ISO
  valorAluguel: number | null;
  valorCaucao: number | null;
  insurer: ContractInsurer | null;
  seguroValorMensal: number | null;
  seguroParcelas: number;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function dateExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  return `${m[3]} de ${MONTHS[Number(m[2]) - 1] ?? ""} de ${m[1]}`;
}

const need = (label: string) => `${MISSING_PREFIX} ${label}]`;
const orNeed = (v: string | null | undefined, label: string) =>
  v && v.trim() ? v.trim() : need(label);
const money = (v: number | null, label: string) =>
  v != null && Number.isFinite(v) && v > 0 ? moneyWithWords(v) : need(label);

/** Qualificação padrão de uma pessoa a partir do cadastro. */
export function qualify(p: {
  nome?: string | null;
  cpfCnpj?: string | null;
  profissao?: string | null;
  endereco?: string | null;
}): string {
  return [
    orNeed(p.nome?.toUpperCase(), "nome completo"),
    need("nacionalidade"),
    need("estado civil"),
    orNeed(p.profissao, "profissão"),
    `inscrito(a) no CPF/CNPJ nº ${orNeed(p.cpfCnpj, "CPF")} e no RG nº ${need("RG")}`,
    `residente e domiciliado(a) na ${orNeed(p.endereco, "endereço")}`,
  ].join(", ");
}

/** Qualificação do cônjuge anuente de um fiador (dados do cadastro do fiador). */
export function qualifySpouse(c: {
  papel: "esposa" | "conjuge";
  nome: string;
  cpf: string;
  rg: string;
  profissao: string;
}): ContractSpouse {
  const nome = c.nome.trim().toUpperCase();
  return {
    papel: c.papel,
    nome: nome || need("nome do cônjuge"),
    qualificacao: [
      orNeed(nome, "nome do cônjuge"),
      orNeed(c.profissao, "profissão do cônjuge"),
      `inscrito(a) no CPF nº ${orNeed(c.cpf, "CPF do cônjuge")} e no RG nº ${orNeed(c.rg, "RG do cônjuge")}`,
    ].join(", "),
  };
}

const spouseRole = (c: ContractSpouse) => (c.papel === "esposa" ? "esposa" : "cônjuge");

/** Seguradoras que podem ser escolhidas para a marca (só ativas). */
export function insurersForBrand(list: ContractInsurer[], brand: ContractBrand): ContractInsurer[] {
  return list.filter((i) => i.active && (i.brands ?? []).includes(brand));
}

export function guaranteeClause(d: ContractData): string {
  if (d.guarantee !== "seguro_fianca") return "";
  if (!d.insurer) return need("seguradora contratada");
  const mensal = d.seguroValorMensal;
  const total = mensal != null ? mensal * d.seguroParcelas : null;
  return d.insurer.clauseTemplate
    .replaceAll("{{seguro_valor_mensal}}", money(mensal, "valor mensal do seguro"))
    .replaceAll("{{seguro_valor_total}}", money(total, "valor total do seguro"))
    .replaceAll("{{seguro_parcelas}}", `${String(d.seguroParcelas).padStart(2, "0")}`);
}

function partyBlock(parties: ContractParty[], heading: string, suffix: string): string {
  if (!parties.length) return `${heading}: ${need(heading.toLowerCase())}`;
  return parties
    .map(
      (p, i) =>
        (i === 0 ? `${heading}: ${p.qualificacao}` : p.qualificacao) +
        (p.conjuge
          ? `, e sua ${spouseRole(p.conjuge)}, ${p.conjuge.qualificacao}, que comparece como anuente`
          : "") +
        (i === parties.length - 1 ? `, doravante denominado(a) “${suffix}”.` : ";"),
    )
    .join("\n\n");
}

function signatures(d: ContractData): string {
  const line = "____________________________________";
  const rows: [string, string][] = [
    [d.locador.qualificacao.split(",")[0] ?? "", "Locador(a)"],
    ...d.locatarios.map((p): [string, string] => [p.qualificacao.split(",")[0] ?? "", "Locatário(a)"]),
  ];
  for (const f of d.fiadores) {
    const nome = f.qualificacao.split(",")[0] ?? "";
    rows.push([nome, "Fiador(a)"]);
    if (f.conjuge) {
      const role = f.conjuge.papel === "esposa" ? "Esposa anuente" : "Cônjuge anuente";
      rows.push([f.conjuge.nome, `${role} do(a) fiador(a) ${nome}`]);
    }
  }
  const blocks = rows.map(([n, r]) => `${line}\n${n}\n${r}`);
  return [...blocks, "Testemunhas:", `${line}\nNome:\nCPF:`, `${line}\nNome:\nCPF:`].join("\n\n");
}

export function fillContract(template: string, d: ContractData): string {
  // Modelos que já trazem a cidade depois do endereço não repetem a cidade.
  const endereco = template.includes("{{imovel_endereco}}, na cidade de")
    ? d.imovelEndereco.replace(/,?\s*na cidade de [^,]+(?:,\s*[A-Z]{2})?\s*$/i, "")
    : d.imovelEndereco;
  const values: Record<string, string> = {
    locador: `LOCADOR(A): ${d.locador.qualificacao}, doravante denominado(a) “LOCADOR(A)”.`,
    locatarios: partyBlock(d.locatarios, "LOCATÁRIO(A)", "LOCATÁRIO(A)"),
    fiadores: partyBlock(d.fiadores, "FIADOR(ES)/PRINCIPAL(IS) PAGADOR(ES)", "FIADOR(ES)"),
    imovel_endereco: orNeed(endereco, "endereço do imóvel"),
    matricula: orNeed(d.matricula, "matrícula do imóvel"),
    bens_fiadores: orNeed(d.bensFiadores, "bens oferecidos pelos fiadores"),
    data_inicio: dateExtenso(d.dataInicio) || need("data de início"),
    data_assinatura: dateExtenso(d.dataAssinatura) || need("data de assinatura"),
    valor_aluguel: money(d.valorAluguel, "valor do aluguel"),
    valor_caucao: money(d.valorCaucao, "valor da caução"),
    clausula_garantia: guaranteeClause(d),
    assinaturas: signatures(d),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? need(k));
}

/** Pendências que impedem baixar o contrato. */
export function missingFields(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\[PREENCHER: ([^\]]+)\]/g)) out.add(m[1] ?? "");
  if (/\{\{\w+\}\}/.test(text) || /\bxxx+\b/i.test(text)) out.add("campos do modelo");
  return [...out];
}
