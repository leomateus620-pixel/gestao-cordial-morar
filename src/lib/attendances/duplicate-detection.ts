// Detecção de cliente já cadastrado no Novo atendimento. Funções puras
// (sem dependências de servidor) para uso em testes, servidor e tela.

export type ContactMatch = {
  source: "attendance" | "client";
  id: string;
  clienteNome: string;
  telefone: string;
  email: string | null;
  corretorId: string | null;
  corretorNome: string | null;
  status: string | null;
  pipelineStage: string | null;
  imobiliaria: string | null;
  createdAt: string;
  updatedAt: string;
};

export const OPEN_STAGES = new Set([
  "primeiro_contato",
  "apresentando_solucao",
  "visita",
  "proposta",
  "fechamento",
  "em_espera",
]);
const CLOSED_STATUS = new Set(["fechado", "perdido", "arquivado"]);
export const STALE_HISTORY_DAYS = 90;

export function phoneDigits(value?: string | null): string {
  return (value ?? "").replace(/\D+/g, "");
}

/** Número nacional (10/11 dígitos) sem DDI 55; outros formatos ficam como vieram. */
export function nationalPhone(value?: string | null): string {
  const d = phoneDigits(value);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d.slice(2);
  return d;
}

/** Chave de comparação: últimos 8 dígitos (igual à função do banco). */
export function phoneKey(value?: string | null): string | null {
  const d = nationalPhone(value);
  return d.length >= 8 ? d.slice(-8) : null;
}

export function isOpenMatch(m: ContactMatch): boolean {
  if (m.source !== "attendance") return false;
  if (m.status && CLOSED_STATUS.has(m.status)) return false;
  return m.pipelineStage ? OPEN_STAGES.has(m.pipelineStage) : true;
}

function rank(m: ContactMatch): number {
  if (m.source === "client") return 4;
  if (isOpenMatch(m)) return m.corretorId ? 1 : 2;
  return 3;
}

export function rankMatches(matches: ContactMatch[], limit = 3): ContactMatch[] {
  return [...matches]
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Atendimento aberto com corretor definido (o que "trava" a reatribuição). */
export function openOwnedMatch(matches: ContactMatch[]): ContactMatch | null {
  return rankMatches(matches, 1).find((m) => isOpenMatch(m) && m.corretorId) ?? null;
}

/** Só histórico encerrado há mais de 90 dias (ou cadastro de cliente) — sem atrito. */
export function isOnlyStaleHistory(matches: ContactMatch[], now = Date.now()): boolean {
  if (matches.length === 0) return false;
  return matches.every((m) => {
    if (m.source === "client") return true;
    if (isOpenMatch(m)) return false;
    return now - new Date(m.updatedAt).getTime() > STALE_HISTORY_DAYS * 86_400_000;
  });
}
