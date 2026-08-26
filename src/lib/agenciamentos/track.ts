import type {
  Agenciamento,
  AgenciamentoBonus,
  AgenciamentoFinalidade,
} from "@/types/agenciamento";

export type AgenciamentoTrack = AgenciamentoFinalidade;

export const SALES_BONUS_LISTINGS = 8;
export const SALES_BONUS_SIGNS = 4;
export const RENTAL_BONUS_LISTINGS = 10;

export const agenciamentoTrackOptions: Array<{
  value: AgenciamentoTrack;
  label: string;
  description: string;
}> = [
  {
    value: "venda",
    label: "Agenciamentos de Venda",
    description: `${SALES_BONUS_LISTINGS} captações + ${SALES_BONUS_SIGNS} placas no mês`,
  },
  {
    value: "aluguel",
    label: "Agenciamentos de Aluguel",
    description: `${RENTAL_BONUS_LISTINGS} captações acumuladas`,
  },
];

export function getTrackLabel(track: AgenciamentoTrack) {
  return track === "aluguel" ? "Aluguel" : "Venda";
}

export function isCountableAgenciamento(item: Agenciamento) {
  const c = item.checklist;
  return (
    item.status !== "cancelado" &&
    item.status !== "reprovado" &&
    c.fotosHorizontal &&
    c.fotosVertical &&
    c.cadastradoMorar &&
    c.cadastradoCordial
  );
}

export function matchesTrack(item: Agenciamento, track: AgenciamentoTrack) {
  return item.finalidade === track;
}

export function filterByTrack(items: Agenciamento[], track: AgenciamentoTrack) {
  return items.filter((item) => matchesTrack(item, track));
}

export function getUnclassifiedAgenciamentos(items: Agenciamento[]) {
  return items.filter((item) => !item.finalidade);
}

export function isSameMonth(dateIso: string, reference: Date) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth()
  );
}

export type BlockingChecklistSummary = {
  /** Agenciamentos ativos do ciclo que ainda não contam para bonificação. */
  blocked: number;
  fotosHorizontal: number;
  fotosVertical: number;
  cadastradoMorar: number;
  cadastradoCordial: number;
};

/** Conta quantos itens de checklist impedem cada agenciamento de contar na bonificação. */
export function summarizeBlockingChecklist(items: Agenciamento[]): BlockingChecklistSummary {
  const active = items.filter(
    (item) => item.status !== "cancelado" && item.status !== "reprovado",
  );
  const blockedItems = active.filter((item) => !isCountableAgenciamento(item));
  return {
    blocked: blockedItems.length,
    fotosHorizontal: blockedItems.filter((item) => !item.checklist.fotosHorizontal).length,
    fotosVertical: blockedItems.filter((item) => !item.checklist.fotosVertical).length,
    cadastradoMorar: blockedItems.filter((item) => !item.checklist.cadastradoMorar).length,
    cadastradoCordial: blockedItems.filter((item) => !item.checklist.cadastradoCordial).length,
  };
}

/** Texto curto com os motivos mais comuns de exclusão ("6 sem fotos verticais..."). */
export function describeBlockingChecklist(summary: BlockingChecklistSummary) {
  const parts: string[] = [];
  if (summary.fotosHorizontal > 0) parts.push(`${summary.fotosHorizontal} sem fotos horizontais`);
  if (summary.fotosVertical > 0) parts.push(`${summary.fotosVertical} sem fotos verticais`);
  if (summary.cadastradoMorar > 0) parts.push(`${summary.cadastradoMorar} sem cadastro Morar`);
  if (summary.cadastradoCordial > 0)
    parts.push(`${summary.cadastradoCordial} sem cadastro Cordial`);
  return parts.join(" · ");
}

export type BonusProgress = {
  track: AgenciamentoTrack;
  /** Captações válidas consideradas no ciclo atual. */
  listings: number;
  /** Placas instaladas consideradas no ciclo (apenas Venda). */
  signs: number;
  /** Total de agenciamentos ativos do ciclo (válidos + bloqueados). */
  cycleTotal: number;
  /** Detalhe dos agenciamentos que não contam por checklist incompleto. */
  blocking: BlockingChecklistSummary;
  /** Bonificações já conquistadas no ciclo atual. */
  earned: number;
  /** Número da próxima bonificação do ciclo. */
  nextLevel: number;
  /** Meta de captações da próxima bonificação. */
  listingsTarget: number;
  /** Meta de placas da próxima bonificação (apenas Venda). */
  signsTarget: number;
  /** Progresso 0-100 rumo à próxima bonificação. */
  percent: number;
  /** Captações que ainda faltam para a próxima bonificação. */
  listingsRemaining: number;
  /** Placas que ainda faltam para a próxima bonificação (apenas Venda). */
  signsRemaining: number;
  cycleLabel: string;
};

export function computeBonusProgress(
  items: Agenciamento[],
  track: AgenciamentoTrack,
  reference = new Date(),
): BonusProgress {
  const trackItems = items.filter((item) => matchesTrack(item, track));

  if (track === "aluguel") {
    const cycleItems = trackItems;
    const blocking = summarizeBlockingChecklist(cycleItems);
    const listings = cycleItems.filter(isCountableAgenciamento).length;
    const earned = Math.floor(listings / RENTAL_BONUS_LISTINGS);
    const progressed = listings % RENTAL_BONUS_LISTINGS;
    return {
      track,
      listings,
      signs: 0,
      cycleTotal: listings + blocking.blocked,
      blocking,
      earned,
      nextLevel: earned + 1,
      listingsTarget: (earned + 1) * RENTAL_BONUS_LISTINGS,
      signsTarget: 0,
      percent: Math.round((progressed / RENTAL_BONUS_LISTINGS) * 100),
      listingsRemaining: RENTAL_BONUS_LISTINGS - progressed,
      signsRemaining: 0,
      cycleLabel: "Acumulado (sem reinício mensal)",
    };
  }

  const cycleItems = trackItems.filter((item) => isSameMonth(item.dataAgenciamento, reference));
  const blocking = summarizeBlockingChecklist(cycleItems);
  const monthly = cycleItems.filter(isCountableAgenciamento);
  const listings = monthly.length;
  const signs = monthly.filter((item) => item.checklist.placaInstalada).length;
  const earned = Math.min(
    Math.floor(listings / SALES_BONUS_LISTINGS),
    Math.floor(signs / SALES_BONUS_SIGNS),
  );
  const listingsTarget = (earned + 1) * SALES_BONUS_LISTINGS;
  const signsTarget = (earned + 1) * SALES_BONUS_SIGNS;
  const listingsRemaining = Math.max(listingsTarget - listings, 0);
  const signsRemaining = Math.max(signsTarget - signs, 0);
  const percent = Math.round(
    (Math.min(listings / listingsTarget, 1) * 0.5 + Math.min(signs / signsTarget, 1) * 0.5) * 100,
  );

  return {
    track,
    listings,
    signs,
    cycleTotal: listings + blocking.blocked,
    blocking,
    earned,
    nextLevel: earned + 1,
    listingsTarget,
    signsTarget,
    percent,
    listingsRemaining,
    signsRemaining,
    cycleLabel: reference.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
  };
}


export function getBonusStatusLabel(status: AgenciamentoBonus["status"]) {
  const labels: Record<AgenciamentoBonus["status"], string> = {
    pendente: "Pendente",
    aprovada: "Aprovada",
    paga: "Paga",
    cancelada: "Cancelada",
  };
  return labels[status];
}

export function getBonusPeriodLabel(bonus: AgenciamentoBonus) {
  if (!bonus.periodoRef) return "Acumulado";
  const date = new Date(`${bonus.periodoRef.slice(0, 10)}T12:00:00.000`);
  if (Number.isNaN(date.getTime())) return "Acumulado";
  return date.toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
}

export function filterBonusesByTrack(bonuses: AgenciamentoBonus[], track: AgenciamentoTrack) {
  return bonuses.filter((bonus) => bonus.categoria === track);
}

export type BonusStatusSummary = {
  total: number;
  pendentes: number;
  validadas: number;
  pagas: number;
  canceladas: number;
};

/** Bonificações aprovadas ou pagas contam como validadas; canceladas ficam fora dos totais. */
export function summarizeBonuses(bonuses: AgenciamentoBonus[]): BonusStatusSummary {
  const pendentes = bonuses.filter((bonus) => bonus.status === "pendente").length;
  const aprovadas = bonuses.filter((bonus) => bonus.status === "aprovada").length;
  const pagas = bonuses.filter((bonus) => bonus.status === "paga").length;
  const canceladas = bonuses.filter((bonus) => bonus.status === "cancelada").length;
  return {
    total: pendentes + aprovadas + pagas,
    pendentes,
    validadas: aprovadas + pagas,
    pagas,
    canceladas,
  };
}

/** Transições de status permitidas ao administrador para uma bonificação. */
export function getAllowedBonusTransitions(
  status: AgenciamentoBonus["status"],
): Array<AgenciamentoBonus["status"]> {
  switch (status) {
    case "pendente":
      return ["aprovada", "paga", "cancelada"];
    case "aprovada":
      return ["paga", "cancelada"];
    case "paga":
      return ["aprovada", "cancelada"];
    case "cancelada":
      return ["pendente"];
    default:
      return [];
  }
}
