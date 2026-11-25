export type BadgeState = "emitido" | "pago" | "andamento" | "pendente" | "teste";
export type BadgeKind = "recibo" | "boleto" | "nf";
export type CompetenceBadge = { kind: BadgeKind; state: BadgeState; label: string };

export type CompetenceRows = {
  emissions: { contract_id: string; tipo: string; status: string }[];
  boletos: { contract_id: string; ambiente: string; estado: string }[];
  nfse: { contract_id: string; status: string }[];
};

/** Travas atuais por marca: boleto só com produção liberada; NF em modo teste é informativa. */
export type BrandGates = Record<string, { boletoAtivo: boolean; nfModoTeste: boolean }>;

const RANK: Record<BadgeState, number> = { pendente: 0, teste: 1, andamento: 2, emitido: 3, pago: 4 };
const best = (states: BadgeState[]): BadgeState =>
  states.reduce<BadgeState>((a, b) => (RANK[b] > RANK[a] ? b : a), "pendente");

export function reciboState(statuses: string[]): BadgeState {
  return best(statuses.map((s) => (s === "emitido" ? "emitido" : s === "emitindo" ? "andamento" : "pendente")));
}

export function boletoState(estados: string[]): BadgeState {
  return best(
    estados.map((e) =>
      e === "liquidado" ? "pago"
      : e === "registrado" ? "emitido"
      : e === "preparando" || e === "enviando" || e === "incerto" ? "andamento"
      : "pendente",
    ),
  );
}

export function nfState(statuses: string[], modoTeste: boolean): BadgeState {
  if (modoTeste) return "teste";
  return best(
    statuses.map((s) =>
      s === "emitida" ? "emitido" : s === "processando" || s === "incerto" ? "andamento" : "pendente",
    ),
  );
}

const LABEL: Record<BadgeKind, string> = { recibo: "Recibo", boleto: "Boleto", nf: "NF" };
const STATE_LABEL: Record<BadgeState, string> = {
  emitido: "emitido", pago: "pago", andamento: "em andamento", pendente: "pendente", teste: "teste",
};

export function badgeLabel(kind: BadgeKind, state: BadgeState) {
  if (kind === "nf" && state === "teste") return "NF teste";
  return `${LABEL[kind]} ${STATE_LABEL[state]}`;
}

export type StatusContract = { id: string; brand: string; status: string };

export function eligibleForBadges(status: string) {
  return status === "ativo" || status === "pendente_assinatura";
}

export function buildCompetenceBadges(
  contracts: StatusContract[],
  rows: CompetenceRows,
  gates: BrandGates,
  showNf: boolean,
): Record<string, CompetenceBadge[]> {
  const out: Record<string, CompetenceBadge[]> = {};
  for (const c of contracts) {
    if (!eligibleForBadges(c.status)) continue;
    const gate = gates[c.brand] ?? { boletoAtivo: false, nfModoTeste: true };
    const badges: CompetenceBadge[] = [];
    const recibo = reciboState(
      rows.emissions.filter((r) => r.contract_id === c.id && r.tipo === "recibo").map((r) => r.status),
    );
    badges.push({ kind: "recibo", state: recibo, label: badgeLabel("recibo", recibo) });
    if (gate.boletoAtivo) {
      const s = boletoState(
        rows.boletos.filter((r) => r.contract_id === c.id && r.ambiente === "producao").map((r) => r.estado),
      );
      badges.push({ kind: "boleto", state: s, label: badgeLabel("boleto", s) });
    }
    if (showNf) {
      const s = nfState(rows.nfse.filter((r) => r.contract_id === c.id).map((r) => r.status), gate.nfModoTeste);
      badges.push({ kind: "nf", state: s, label: badgeLabel("nf", s) });
    }
    out[c.id] = badges;
  }
  return out;
}

/** Conta só os selos exibidos; "NF teste" nunca é pendência. */
export function countPending(badges: Record<string, CompetenceBadge[]>) {
  return Object.values(badges).filter((list) => list.some((b) => b.state === "pendente")).length;
}

export function hasPending(badges: CompetenceBadge[] | undefined) {
  return !!badges?.some((b) => b.state === "pendente");
}
