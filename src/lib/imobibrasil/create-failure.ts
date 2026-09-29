/**
 * Classificação da falha do POST `/imovel/inserir` (puro, testável).
 *
 * `definitive` = temos prova de que o site NÃO criou nada: 429 devolvido pelo
 * próprio site, 400/422 de validação, ou erro local antes do envio (pausa,
 * catálogo). Só nesses casos o checkpoint de criação pode ser desfeito.
 * Todo o resto (401, 403, 404, 409, 5xx, rede, timeout, resposta sem ID,
 * desconhecido) é `ambiguous` e segue a regra de 3 leituras de ausência.
 */
export type CreateFailureKind = "definitive" | "ambiguous";

export type CreateFailureInput = {
  category?: string | null;
  httpStatus?: number | null;
  ambiguous?: boolean;
  /** Erro lançado antes de qualquer requisição ao site. */
  beforeSend?: boolean;
};

const LOCAL_CATEGORIES = new Set(["mapping", "config"]);

export function classifyCreateFailure(error: CreateFailureInput): CreateFailureKind {
  if (error.ambiguous) return "ambiguous";
  if (error.beforeSend && (LOCAL_CATEGORIES.has(String(error.category)) || error.category === "paused")) {
    return "definitive";
  }
  const status = error.httpStatus ?? null;
  if (status === 429 && error.category === "rate_limit") return "definitive";
  if ((status === 400 || status === 422) && error.category === "validation") return "definitive";
  return "ambiguous";
}
