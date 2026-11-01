/** Regras puras do Realce (sem rede, sem DOM). Reutilizáveis no futuro fluxo de imóveis. */

export type RealceStatus = "rascunho" | "na_fila" | "processando" | "pronta" | "falha" | "incerto";
export type RealceTechnique = "ia" | "preset";
/** Estado exibido: inclui etapas que só existem no aparelho (preparando/enviando). */
export type RealceUiStatus = "local" | "enviando" | RealceStatus;

export const REALCE_MAX_FILES = 30;
export const REALCE_MAX_BYTES = 40 * 1024 * 1024;
export const REALCE_DAILY_AI_LIMIT = 60;
export const REALCE_WORK_MAX_EDGE = 3072;
export const REALCE_AI_LONG_EDGE = 2048;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ACCEPTED_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

export function isHeic(file: { name: string; type: string }) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export function validateFile(file: { name: string; type: string; size: number }): string | null {
  const okType = ACCEPTED_TYPES.includes(file.type.toLowerCase()) || ACCEPTED_EXT.test(file.name);
  if (!okType) return "Formato não aceito. Use JPG, PNG, WebP ou HEIC.";
  if (file.size <= 0) return "Arquivo vazio.";
  if (file.size > REALCE_MAX_BYTES) return "Arquivo acima de 40 MB.";
  return null;
}

/** Quantidade selecionada = total × 25%, arredondado para cima. */
export function suggestedCount(total: number): number {
  if (total <= 0) return 0;
  return Math.ceil(total * 0.25);
}

/** Sugestão distribuída ao longo do lote (não só as primeiras fotos). */
export function suggestSelection<T>(ids: T[]): Set<T> {
  const n = suggestedCount(ids.length);
  const chosen = new Set<T>();
  if (n === 0) return chosen;
  const step = ids.length / n;
  for (let i = 0; i < n; i++) chosen.add(ids[Math.min(ids.length - 1, Math.floor(i * step))]!);
  return chosen;
}

export function resultFileName(original: string): string {
  const base = original.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${base || "foto"}-realce.jpg`;
}

/** Tamanho pedido à IA: mesma proporção, múltiplos de 16, limites do modelo. */
export function aiEditSize(width: number, height: number) {
  const ratio = width / height;
  const clamped = Math.min(3, Math.max(1 / 3, ratio));
  const long = REALCE_AI_LONG_EDGE;
  const r16 = (v: number) => Math.max(16, Math.round(v / 16) * 16);
  let w = clamped >= 1 ? long : r16(long * clamped);
  let h = clamped >= 1 ? r16(long / clamped) : long;
  while (w * h < 655_360) { w += 16; h = r16(w / clamped); }
  return { width: w, height: h, size: `${w}x${h}`, ratioClamped: clamped !== ratio };
}

/** Diferença relevante de proporção (>1,5%) entre original e resultado. */
export function ratioDiffers(aw: number, ah: number, bw: number, bh: number) {
  return Math.abs(aw / ah - bw / bh) / (aw / ah) > 0.015;
}

export const statusLabel: Record<RealceUiStatus, string> = {
  local: "Aguardando",
  enviando: "Enviando",
  rascunho: "Aguardando",
  na_fila: "Na fila",
  processando: "Processando",
  pronta: "Pronta para comparar",
  falha: "Falha no processamento",
  incerto: "Sem confirmação",
};

export const retryable = (s: RealceStatus) => s === "falha" || s === "incerto";
export const inFlight = (s: RealceUiStatus) => s === "enviando" || s === "na_fila" || s === "processando";

export const REALCE_NATURAL_PROMPT = `Aprimore esta fotografia imobiliária de forma natural, profissional e fiel ao imóvel original. Equilibre a exposição, clareie suavemente as sombras, preserve detalhes nas áreas claras e ajuste o balanço de branco. Melhore discretamente o contraste, as cores e a nitidez, evitando saturação excessiva, tons alaranjados e aparência artificial.

Preserve o enquadramento, as proporções, a perspectiva, a orientação e todos os elementos presentes na fotografia. Não corte, não amplie o campo de visão e não gire a imagem. Não adicione, remova, substitua ou reconstrua móveis, objetos, vegetação, paredes, portas, janelas, pisos, fachada ou quaisquer outros detalhes. Não altere a vista ou o céu e não crie incidência de sol, sombras, reflexos ou fontes de luz inexistentes. Não insira textos, marcas ou elementos gráficos.

A imagem deve continuar representando o mesmo imóvel e as mesmas condições visíveis na fotografia original.`;
