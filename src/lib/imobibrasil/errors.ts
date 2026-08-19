/**
 * Normalização e sanitização de erros da API ImobiBrasil.
 * Regra inegociável: nenhum token, header de autenticação ou dado de proprietário
 * pode atravessar esta camada em direção a logs ou ao navegador.
 */

export type ImobiErrorCategory =
  | "config" // secret ausente / conta inválida (401)
  | "auth"
  | "validation" // 400 — aguarda correção do imóvel
  | "rate_limit" // 429
  | "server" // 5xx
  | "network" // falha de rede / timeout
  | "protocol" // resposta não-JSON, HTML inesperado, JSON inválido
  | "business" // HTTP 2xx com status:false
  | "mapping" // código de catálogo não resolvido localmente
  | "unknown";

export const RETRYABLE_CATEGORIES: ReadonlySet<ImobiErrorCategory> = new Set([
  "rate_limit",
  "server",
  "network",
]);

export class ImobiApiError extends Error {
  readonly category: ImobiErrorCategory;
  readonly httpStatus: number | null;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly ambiguous: boolean;

  constructor(params: {
    message: string;
    category: ImobiErrorCategory;
    httpStatus?: number | null;
    code?: string | null;
    ambiguous?: boolean;
  }) {
    super(sanitizeMessage(params.message));
    this.name = "ImobiApiError";
    this.category = params.category;
    this.httpStatus = params.httpStatus ?? null;
    this.code = params.code ?? null;
    this.retryable = RETRYABLE_CATEGORIES.has(params.category);
    this.ambiguous = params.ambiguous ?? false;
  }
}

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/("?token"?\s*[:=]\s*")[^"]*(")/gi, "$1[redacted]$2"],
  [/(bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[redacted]"],
  [/([?&](token|apikey|api_key)=)[^&\s]+/gi, "$1[redacted]"],
];

/** Remove segredos e reduz o tamanho de qualquer mensagem antes de persistir/exibir. */
export function sanitizeMessage(input: unknown, maxLength = 500): string {
  let text =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : (() => {
            try {
              return JSON.stringify(input);
            } catch {
              return String(input);
            }
          })();
  if (!text) text = "Erro desconhecido";
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Extrai a mensagem de erro aceitando message | resultSet | error | texto bruto. */
export function extractProviderMessage(body: unknown, rawText?: string): string | null {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const field of ["message", "mensagem", "error", "erro", "resultSet", "result"]) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        const parts = value
          .map((item) =>
            typeof item === "string"
              ? item
              : item && typeof item === "object"
                ? ((item as Record<string, unknown>).message ??
                  (item as Record<string, unknown>).descricao ??
                  null)
                : null,
          )
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        if (parts.length) return parts.join(" · ");
      }
      if (value && typeof value === "object") {
        const nested = extractProviderMessage(value);
        if (nested) return nested;
      }
    }
  }
  if (typeof rawText === "string" && rawText.trim()) {
    const trimmed = rawText.trim();
    if (/^\s*</.test(trimmed)) return "Resposta inesperada do provedor (HTML).";
    return trimmed;
  }
  return null;
}

export function categoryForHttpStatus(status: number): ImobiErrorCategory {
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "config";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

export function toImobiError(error: unknown): ImobiApiError {
  if (error instanceof ImobiApiError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ImobiApiError({
      message: "Tempo limite excedido ao falar com o provedor.",
      category: "network",
      ambiguous: true,
    });
  }
  return new ImobiApiError({ message: sanitizeMessage(error), category: "network" });
}
