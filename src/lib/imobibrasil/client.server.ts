/**
 * Cliente HTTP compartilhado da ImobiBrasil. Server-only.
 *
 * Nenhuma chamada parte do navegador; o token vem exclusivamente dos secrets do
 * servidor e nunca é gravado em tabela, log, erro ou resposta ao frontend.
 */

import {
  ImobiApiError,
  categoryForHttpStatus,
  explainProviderMessage,
  extractProviderMessage,
  sanitizeMessage,
  toImobiError,
} from "./errors";

import { providerConfig, type ImobiProvider } from "./providers";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export type ImobiRequestLog = {
  provider: ImobiProvider;
  path: string;
  method: string;
  httpStatus: number | null;
  durationMs: number;
  ok: boolean;
  errorCategory?: string;
  correlationId: string;
};

export type ImobiResponse<T = unknown> = {
  data: T;
  httpStatus: number;
  durationMs: number;
};

function providerToken(provider: ImobiProvider): string {
  const { tokenSecret } = providerConfig(provider);
  // Tokens colados do painel costumam trazer espaços/quebras de linha; o header
  // HTTP não aceita esses caracteres e a API responde 401 sem explicar o motivo.
  const token = process.env[tokenSecret]?.replace(/\s+/g, "");
  if (!token) {
    throw new ImobiApiError({
      message: `Token do provedor não configurado (${tokenSecret}).`,
      category: "config",
    });
  }
  return token;
}

export function hasProviderToken(provider: ImobiProvider): boolean {
  return Boolean(process.env[providerConfig(provider).tokenSecret]);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const base = Math.min(8000, 500 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 250);
}

/** Caminho sem query sensível, próprio para log. */
function loggablePath(path: string): string {
  return path.split("?")[0] ?? path;
}

export type ImobiRequestOptions = {
  method?: "GET" | "POST";
  /** JSON body. Mutuamente exclusivo com `formData`. */
  json?: Record<string, unknown>;
  /** multipart — o runtime gera o boundary. */
  formData?: FormData;
  /** Headers extras exigidos pelo contrato (ex.: codigoImovel duplicado no header). */
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  /** Requisições ambíguas (criação) não devem sofrer retry cego. */
  allowRetry?: boolean;
  /**
   * Falhas de rede/timeout podem ser repetidas mesmo fora de GET quando a
   * operação é idempotente do lado do provedor (ex.: upload de imagem com hash).
   */
  retryOnNetwork?: boolean;
  correlationId?: string;
  onLog?: (entry: ImobiRequestLog) => void;
};

export async function imobiRequest<T = unknown>(
  provider: ImobiProvider,
  path: string,
  options: ImobiRequestOptions = {},
): Promise<ImobiResponse<T>> {
  const { baseUrl } = providerConfig(provider);
  const token = providerToken(provider);
  const method = options.method ?? "GET";
  const correlationId = options.correlationId ?? crypto.randomUUID();
  const allowRetry = options.allowRetry ?? method === "GET";
  // Retry cego só em GET. Fora disso, no máximo repetimos falhas de
  // rede/timeout quando a chamada foi marcada como idempotente.
  const networkOnlyRetry = !allowRetry && options.retryOnNetwork === true;
  const maxAttempts = allowRetry || networkOnlyRetry ? MAX_ATTEMPTS : 1;
  const canRetry = (error: ImobiApiError) =>
    allowRetry ? error.retryable : networkOnlyRetry && error.category === "network";

  let lastError: ImobiApiError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        token,
        "X-Correlation-Id": correlationId,
        ...(options.extraHeaders ?? {}),
      };
      let body: BodyInit | undefined;
      if (options.formData) {
        body = options.formData; // boundary gerado pelo runtime
      } else if (options.json) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.json);
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const durationMs = Date.now() - started;
      const rawText = await response.text();

      let parsed: unknown = null;
      let parseFailed = false;
      if (rawText.trim()) {
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parseFailed = true;
        }
      }

      const log = (ok: boolean, errorCategory?: string) =>
        options.onLog?.({
          provider,
          path: loggablePath(path),
          method,
          httpStatus: response.status,
          durationMs,
          ok,
          errorCategory,
          correlationId,
        });

      if (!response.ok) {
        const category = categoryForHttpStatus(response.status);
        log(false, category);
        const providerMessage =
          extractProviderMessage(parsed, rawText) ?? `Falha HTTP ${response.status} no provedor.`;
        const error = new ImobiApiError({
          message: explainProviderMessage(providerMessage, response.status),
          category,
          httpStatus: response.status,
        });

        if (canRetry(error) && attempt < maxAttempts) {
          lastError = error;
          await delay(backoffMs(attempt));
          continue;
        }
        throw error;
      }

      if (parseFailed) {
        log(false, "protocol");
        throw new ImobiApiError({
          message: /^\s*</.test(rawText)
            ? "Resposta inesperada do provedor (HTML em vez de JSON)."
            : "Resposta do provedor não é JSON válido.",
          category: "protocol",
          httpStatus: response.status,
        });
      }

      // HTTP 2xx com status:false também é falha.
      if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).status === false) {
        log(false, "business");
        throw new ImobiApiError({
          message: explainProviderMessage(
            extractProviderMessage(parsed, rawText) ?? "O provedor recusou a operação.",
            response.status,
          ),
          category: "business",
          httpStatus: response.status,
        });
      }

      log(true);
      return { data: (parsed ?? {}) as T, httpStatus: response.status, durationMs };
    } catch (error) {
      const normalized = toImobiError(error);
      options.onLog?.({
        provider,
        path: loggablePath(path),
        method,
        httpStatus: normalized.httpStatus,
        durationMs: Date.now() - started,
        ok: false,
        errorCategory: normalized.category,
        correlationId,
      });
      if (canRetry(normalized) && attempt < maxAttempts) {
        lastError = normalized;
        await delay(backoffMs(attempt));
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new ImobiApiError({ message: "Falha desconhecida.", category: "unknown" });
}

/** Extrai o ID externo de forma tolerante — a API não documenta o corpo de sucesso. */
export function extractExternalId(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string" || typeof payload === "number") {
    const text = String(payload).trim();
    return /^\d+$/.test(text) ? text : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractExternalId(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["codigoImovel", "codigo", "codigo_imovel", "id", "idImovel"]) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
    }
    for (const key of ["resultSet", "data", "result", "imovel", "retorno"]) {
      if (key in record) {
        const found = extractExternalId(record[key]);
        if (found) return found;
      }
    }
  }
  return null;
}

export { sanitizeMessage };
