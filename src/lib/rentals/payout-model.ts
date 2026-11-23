/**
 * Pure owner-payout model (repasse). Integer cents only. Mirrors the receipt rule
 * (rent + condo − fees ± owner-bound adjustments; IPTU / seguro-fiança excluded)
 * but keeps every line with origin, sign, recipient and rule so finance can audit it.
 * Values are a forecast until finance validates the rules per contract.
 */
export type PayoutStatus =
  | "previsto" | "aguardando_recebimento" | "em_conferencia" | "aprovado"
  | "pago_manual" | "confirmado" | "divergente";

export type PayoutLine = {
  origem: "aluguel" | "condominio" | "honorarios" | "ajuste_inquilino" | "ajuste_proprietario";
  descricao: string;
  sinal: 1 | -1;
  valorCentavos: number; // always ≥ 0; direction comes from `sinal`
  destinatario: "proprietario" | "imobiliaria";
  regra: string;
};

export type PayoutInput = {
  aluguelCentavos: number;
  condominioCentavos: number;
  honorariosCentavos: number;
  ajustesInquilino?: { descricao: string; tipo: "desconto" | "acrescimo"; valorCentavos: number; repassarProprietario?: boolean }[];
  ajustesProprietario?: { descricao: string; tipo: "desconto" | "acrescimo"; valorCentavos: number }[];
};

const int = (n: number, label: string) => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Valor inválido em ${label}.`);
  return n;
};

export function buildPayoutLines(i: PayoutInput): PayoutLine[] {
  const lines: PayoutLine[] = [
    { origem: "aluguel", descricao: "Aluguel", sinal: 1, valorCentavos: int(i.aluguelCentavos, "aluguel"), destinatario: "proprietario", regra: "aluguel_integral" },
  ];
  if (i.condominioCentavos > 0)
    lines.push({ origem: "condominio", descricao: "Condomínio", sinal: 1, valorCentavos: int(i.condominioCentavos, "condomínio"), destinatario: "proprietario", regra: "condominio_repassado" });
  if (i.honorariosCentavos > 0)
    lines.push({ origem: "honorarios", descricao: "Honorários de administração", sinal: -1, valorCentavos: int(i.honorariosCentavos, "honorários"), destinatario: "imobiliaria", regra: "honorarios_deduzidos" });
  for (const a of i.ajustesInquilino ?? [])
    if (a.repassarProprietario)
      lines.push({ origem: "ajuste_inquilino", descricao: a.descricao, sinal: a.tipo === "acrescimo" ? 1 : -1, valorCentavos: int(a.valorCentavos, a.descricao), destinatario: "proprietario", regra: "ajuste_inquilino_repassavel" });
  for (const a of i.ajustesProprietario ?? [])
    lines.push({ origem: "ajuste_proprietario", descricao: a.descricao, sinal: a.tipo === "acrescimo" ? 1 : -1, valorCentavos: int(a.valorCentavos, a.descricao), destinatario: "proprietario", regra: "ajuste_proprietario" });
  return lines;
}

export const sumLines = (lines: PayoutLine[]) => lines.reduce((s, l) => s + l.sinal * l.valorCentavos, 0);

/** Decides whether an approval can be recorded. Never negative, never above what was received. */
export function checkApproval(p: {
  previstoCentavos: number; aprovadoCentavos: number; recebidoCentavos: number | null;
  destinoVersao: number | null; destinoVersaoAtual: number | null; decisaoMotivo?: string;
}): { ok: true } | { ok: false; motivo: string } {
  if (p.recebidoCentavos === null) return { ok: false, motivo: "Recebimento ainda não informado." };
  if (p.aprovadoCentavos <= 0) return { ok: false, motivo: "Repasse precisa ser maior que zero." };
  if (p.aprovadoCentavos > p.recebidoCentavos) return { ok: false, motivo: "Repasse acima do valor recebido." };
  if (p.destinoVersao === null || p.destinoVersao !== p.destinoVersaoAtual)
    return { ok: false, motivo: "Dados bancários do proprietário ausentes ou alterados; confira de novo." };
  if (p.aprovadoCentavos !== p.previstoCentavos && !p.decisaoMotivo?.trim())
    return { ok: false, motivo: "Valor diferente do previsto exige decisão registrada com motivo." };
  return { ok: true };
}

/** Allowed transitions; anything else is rejected (reversals are new events, never edits). */
const NEXT: Record<PayoutStatus, PayoutStatus[]> = {
  previsto: ["aguardando_recebimento", "em_conferencia", "divergente"],
  aguardando_recebimento: ["em_conferencia", "divergente"],
  em_conferencia: ["aprovado", "divergente"],
  aprovado: ["pago_manual", "em_conferencia", "divergente"],
  pago_manual: ["confirmado", "divergente"],
  confirmado: ["divergente"],
  divergente: ["em_conferencia"],
};
export const canTransition = (from: PayoutStatus, to: PayoutStatus) => NEXT[from].includes(to);

/** Only a confirmed state may be shown to the owner as "Repassado". */
export const isRepassado = (s: PayoutStatus) => s === "confirmado";
