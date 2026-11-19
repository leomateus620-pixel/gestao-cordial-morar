/** Pure boleto rules shared by the server and the confirmation modal. Browser-safe. */
export type BoletoBrand = "cordial" | "morar";
export type BillingAmbiente = "sandbox" | "producao";
export type BoletoEstado =
  | "preparando"
  | "enviando"
  | "registrado"
  | "incerto"
  | "rejeitado"
  | "baixa_solicitada"
  | "baixado"
  | "liquidado";
export const LIVE_ESTADOS: BoletoEstado[] = [
  "preparando",
  "enviando",
  "registrado",
  "incerto",
  "baixa_solicitada",
  "liquidado",
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Today in America/Sao_Paulo (YYYY-MM-DD). */
export function todaySaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Contract due day inside the competence, clamped to the month's last day (31 → 28/29/30). */
export function boletoDueDate(competencia: string, diaVencimento: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error("Competência inválida.");
  if (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31)
    throw new Error("Dia de vencimento do contrato inválido.");
  const [y, m] = competencia.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${competencia}-${String(Math.min(diaVencimento, last)).padStart(2, "0")}`;
}
export const MAX_OVERRIDE_DAYS = 120;
export type VencimentoResult =
  | { ok: true; vencimento: string; original: string; alterado: boolean }
  | {
      ok: false;
      code: "vencimento_passado" | "vencimento_invalido";
      original: string;
      message: string;
    };
/**
 * The contract date wins while it is today or later. Once it has passed, the operator must
 * inform a new future date (tomorrow or later, at most MAX_OVERRIDE_DAYS ahead).
 */
export function resolveVencimento(args: {
  competencia: string;
  diaVencimento: number;
  today: string;
  novoVencimento?: string | null;
}): VencimentoResult {
  const original = boletoDueDate(args.competencia, args.diaVencimento);
  if (original >= args.today) {
    if (args.novoVencimento && args.novoVencimento !== original)
      return {
        ok: false,
        code: "vencimento_invalido",
        original,
        message: "O vencimento do contrato ainda não passou; ele não pode ser alterado aqui.",
      };
    return { ok: true, vencimento: original, original, alterado: false };
  }
  if (!args.novoVencimento)
    return {
      ok: false,
      code: "vencimento_passado",
      original,
      message: "O vencimento desta competência já passou. Informe uma nova data de vencimento.",
    };
  if (!isIsoDate(args.novoVencimento) || args.novoVencimento <= args.today)
    return {
      ok: false,
      code: "vencimento_invalido",
      original,
      message: "A nova data de vencimento precisa ser futura.",
    };
  if (args.novoVencimento > addDays(args.today, MAX_OVERRIDE_DAYS))
    return {
      ok: false,
      code: "vencimento_invalido",
      original,
      message: `A nova data de vencimento deve ficar em até ${MAX_OVERRIDE_DAYS} dias.`,
    };
  return { ok: true, vencimento: args.novoVencimento, original, alterado: true };
}
/** Last business day (Mon–Fri) strictly before `today`. */
export function lastBusinessDay(today: string): string {
  let d = addDays(today, -1);
  for (;;) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) return d;
    d = addDays(d, -1);
  }
}
export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
export function isValidCpf(v: string): boolean {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export function isValidCnpj(v: string): boolean {
  const d = digits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const w =
      n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
export type PagadorSource = {
  nome?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
};
export type Pendencia = { campo: string; tela: string };
export type PagadorNormalizado = {
  tipoPessoa: "PESSOA_FISICA" | "PESSOA_JURIDICA";
  documento: string;
  nome: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  email?: string;
  telefone?: string;
};
const clip = (s: string | null | undefined, n: number) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** Tenant is the payer; the rented property is the billing address. */
export function normalizePagador(
  p: PagadorSource,
): { ok: true; pagador: PagadorNormalizado } | { ok: false; pendencias: Pendencia[] } {
  const pend: Pendencia[] = [];
  const doc = digits(p.documento);
  if (!clip(p.nome, 40)) pend.push({ campo: "Nome do inquilino", tela: "Inquilino" });
  if (!(doc.length === 11 ? isValidCpf(doc) : doc.length === 14 ? isValidCnpj(doc) : false))
    pend.push({ campo: "CPF/CNPJ válido do inquilino", tela: "Inquilino" });
  if (!clip(p.logradouro, 40)) pend.push({ campo: "Endereço (rua)", tela: "Imóvel do aluguel" });
  if (!clip(p.cidade, 40)) pend.push({ campo: "Cidade", tela: "Imóvel do aluguel" });
  if (!/^[A-Za-z]{2}$/.test((p.uf ?? "").trim()))
    pend.push({ campo: "UF", tela: "Imóvel do aluguel" });
  if (digits(p.cep).length !== 8) pend.push({ campo: "CEP", tela: "Imóvel do aluguel" });
  if (pend.length) return { ok: false, pendencias: pend };
  const endereco = clip(
    [p.logradouro, p.numero, p.complemento, p.bairro]
      .map((s) => clip(s, 40))
      .filter(Boolean)
      .join(", "),
    40,
  );
  const email = clip(p.email, 60);
  const tel = digits(p.telefone);
  return {
    ok: true,
    pagador: {
      tipoPessoa: doc.length === 11 ? "PESSOA_FISICA" : "PESSOA_JURIDICA",
      documento: doc,
      nome: clip(p.nome, 40),
      endereco,
      cidade: clip(p.cidade, 40),
      uf: (p.uf ?? "").trim().toUpperCase(),
      cep: digits(p.cep),
      ...(email.length <= 40 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
      ...(tel.length >= 10 ? { telefone: tel.slice(-11) } : {}),
    },
  };
}
/** ***.456.789-** / **.345.678/0001-** */
export function maskDocumento(doc: string): string {
  const d = digits(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return "não informado";
}
export type Encargos = {
  ativo: boolean;
  tipoJuros?: "VALOR" | "PERCENTUAL";
  tipoJurosPercentual?: "DIARIO" | "MENSAL";
  juros?: number;
  tipoMulta?: "VALOR" | "PERCENTUAL";
  multa?: number;
};
export const DEFAULT_ENCARGOS: Encargos = { ativo: false };
/** Validates and normalizes account charges; inactive charges are kept but never sent. */
export function parseEncargos(raw: unknown): Encargos {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, max: number, label: string) => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)
      throw new Error(`${label} inválido.`);
    return Math.round(v * 100) / 100;
  };
  const tipoJuros = r.tipoJuros === "VALOR" ? "VALOR" : "PERCENTUAL";
  const tipoMulta = r.tipoMulta === "VALOR" ? "VALOR" : "PERCENTUAL";
  return {
    ativo: r.ativo === true,
    tipoJuros,
    tipoJurosPercentual: r.tipoJurosPercentual === "DIARIO" ? "DIARIO" : "MENSAL",
    juros: num(r.juros, tipoJuros === "PERCENTUAL" ? 10 : 99999, "Juros"),
    tipoMulta,
    multa: num(r.multa, tipoMulta === "PERCENTUAL" ? 20 : 99999, "Multa"),
  };
}
/** Maps the bank `situacao` text to a local state; null keeps the current state. */
export function estadoFromSituacao(situacao: string | null | undefined): BoletoEstado | null {
  const s = (situacao ?? "").toUpperCase();
  if (s.includes("LIQUIDADO")) return "liquidado";
  if (s.includes("BAIXADO")) return "baixado";
  return null;
}
export function formatCompetencia(c: string) {
  return `${c.slice(5, 7)}/${c.slice(0, 4)}`;
}
/** Server-side decision: the contract owner alone never issues; meta reviewers never act. */
export function boletoPermissions(flags: {
  admin: boolean;
  secretaria: boolean;
  metaReviewer: boolean;
}) {
  const admin = flags.admin && !flags.metaReviewer;
  const secretaria = flags.secretaria && !flags.metaReviewer;
  return { podeEmitir: admin || secretaria, podeGerenciarContas: admin };
}

/**
 * Who may operate boletos of one contract. Admin: any brand. Secretaria: only brands linked
 * in user_agencies (an "ambas" contract counts when she has any brand). Restricted roles never.
 */
export function boletoContractAccess(
  flags: {
    admin: boolean;
    secretaria: boolean;
    metaReviewer: boolean;
    atendimentosViewer: boolean;
    agencies: string[];
  },
  contractBrand: string | null | undefined,
): boolean {
  if (flags.metaReviewer || flags.atendimentosViewer) return false;
  if (flags.admin) return true;
  if (!flags.secretaria) return false;
  const mine = flags.agencies.filter((a) => a === "cordial" || a === "morar");
  if (mine.length === 0) return false;
  if (contractBrand === "ambas") return true;
  return (mine as string[]).includes(String(contractBrand));
}
