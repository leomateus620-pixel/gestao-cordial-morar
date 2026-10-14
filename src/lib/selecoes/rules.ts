/**
 * Regras puras das seleções compartilhadas (sem acesso a rede ou navegador).
 */

export const SELECTION_MAX_ITEMS = 60;
export const SELECTION_DEFAULT_DAYS = 30;
export const SELECTION_VALIDITY_OPTIONS = [7, 15, 30, 60, 0] as const; // 0 = sem validade

/** Adiciona sem duplicar, preservando a ordem de escolha. */
export function addUnique(ids: string[], id: string): string[] {
  if (ids.includes(id) || ids.length >= SELECTION_MAX_ITEMS) return ids;
  return [...ids, id];
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : addUnique(ids, id);
}

export function moveId(ids: string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids)).slice(0, SELECTION_MAX_ITEMS);
}

function shortMoney(value: number) {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `R$ ${m.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (value >= 1000) return `R$ ${Math.round(value / 1000)} mil`;
  return `R$ ${value}`;
}

function pluralTipo(tipo: string) {
  const t = tipo.trim();
  if (!t) return "Imóveis";
  if (/[sS]$/.test(t)) return t;
  if (/ão$/i.test(t)) return t.replace(/ão$/i, "ões");
  return `${t}s`;
}

/** Ex.: "Casas em Santa Rosa até R$ 450 mil". */
export function suggestTitle(f: {
  tipo?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  operacao?: string | null;
  valorMax?: number | null;
}): string {
  let title = pluralTipo(f.tipo ?? "");
  if (f.operacao === "aluguel") title += " para alugar";
  else if (f.operacao === "venda") title += " à venda";
  const place = f.bairro || f.cidade;
  if (place) title += ` em ${place}`;
  if (f.valorMax) title += ` até ${shortMoney(f.valorMax)}`;
  return title === "Imóveis" ? "Imóveis selecionados para você" : title;
}

export function expiresAtFor(days: number, now = new Date()): string | null {
  if (!days) return null;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Telefone para wa.me: só dígitos, com DDI 55 quando faltar. */
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function isValidWhatsapp(raw: string): boolean {
  const n = normalizeWhatsapp(raw);
  return n === "" || /^\d{12,15}$/.test(n);
}

const WA_MAX_REFS = 15;

/** Texto preparado para o cliente revisar e enviar. Nunca é enviado automaticamente. */
export function buildClientWhatsappText(opts: {
  title: string;
  link: string;
  favoriteRefs: string[];
}): string {
  const refs = opts.favoriteRefs.filter(Boolean);
  if (!refs.length) {
    return `Olá! Vi a seleção "${opts.title}" e gostaria de conversar sobre as opções.\n${opts.link}`;
  }
  const shown = refs.slice(0, WA_MAX_REFS);
  const extra = refs.length - shown.length;
  const list = shown.map((r) => `• Ref. ${r}`).join("\n");
  const more = extra > 0 ? `\n• e mais ${extra} ${extra === 1 ? "opção" : "opções"}` : "";
  return `Olá! Gostei destes imóveis da seleção "${opts.title}":\n${list}${more}\n${opts.link}`;
}

/** Mensagem inicial que o corretor pode editar antes de compartilhar. */
export function buildBrokerShareText(opts: { title: string; link: string; clientName?: string }) {
  const hi = opts.clientName?.trim() ? `Olá, ${opts.clientName.trim().split(" ")[0]}!` : "Olá!";
  return `${hi} Separei algumas opções de imóveis para você: "${opts.title}".\n${opts.link}`;
}

export function whatsappUrl(phone: string, text: string): string {
  const n = normalizeWhatsapp(phone);
  const q = `text=${encodeURIComponent(text)}`;
  return n ? `https://wa.me/${n}?${q}` : `https://wa.me/?${q}`;
}

export type SelectionStatus = "ativa" | "encerrada" | "expirada";

export function selectionStatus(s: { status: string; expires_at: string | null }, now = Date.now()) {
  if (s.status !== "ativa") return "encerrada" as const;
  if (s.expires_at && new Date(s.expires_at).getTime() < now) return "expirada" as const;
  return "ativa" as const;
}
