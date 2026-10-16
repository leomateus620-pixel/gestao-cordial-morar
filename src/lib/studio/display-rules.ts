/**
 * Regras de exibição de preço e localização no conteúdo gerado pelo Estúdio.
 * Espelha a regra pública: preço só quando valor_modo = 'fixo'; localização
 * só bairro/cidade — nunca endereço.
 */

export type PropertyDisplayInput = {
  valor: number | null;
  valor_modo: "fixo" | "consulte" | string;
  bairro: string | null;
  cidade: string | null;
};

export function displayPrice(p: PropertyDisplayInput): string | null {
  if (p.valor_modo !== "fixo") return null;
  if (p.valor == null || !Number.isFinite(p.valor) || p.valor <= 0) return null;
  return p.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Só bairro/cidade — nunca rua, número ou código interno. */
export function displayLocation(p: PropertyDisplayInput): string {
  return [p.bairro, p.cidade].filter((v) => v && v.trim()).join(" · ");
}

export type PriceHistoryPoint = { valor: number; recorded_at: string };

/**
 * Selo "Baixou o preço": só com histórico real de pelo menos dois pontos
 * confiáveis, com queda efetiva. Sem histórico confiável, não exibe nada.
 */
export function priceDropBadge(history: readonly PriceHistoryPoint[] | null | undefined): boolean {
  if (!history || history.length < 2) return false;
  const sorted = [...history].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const first = sorted[0]?.valor;
  const last = sorted[sorted.length - 1]?.valor;
  if (first == null || last == null || !Number.isFinite(first) || !Number.isFinite(last)) return false;
  return last < first;
}

/** Selo "Novo": só com data de publicação real, dentro da janela definida. */
export function newBadge(publishedAt: string | null | undefined, now = Date.now(), windowDays = 14): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const days = (now - t) / 86_400_000;
  return days >= 0 && days <= windowDays;
}
