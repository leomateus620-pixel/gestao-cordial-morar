import process from "node:process";
import { createHash } from "node:crypto";
import {
  AdProviderError,
  AD_ERROR_MESSAGES,
  type AdErrorCode,
  type AdRequestDiagnostics,
} from "./types";

// The default is not evidence of live access; diagnostics record the configured version.
export function metaGraphVersion(): string {
  const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
  if (!/^v\d{2,3}\.0$/.test(version))
    throw new AdProviderError("not_configured", "Versão Graph inválida.");
  return version;
}
export const externalId = (value: string): string => {
  if (!/^\d{1,80}$/.test(value))
    throw new AdProviderError("invalid_link", "Identificador externo inválido.");
  return value;
};
export const normalizeAccountId = (id: string) => externalId(id.replace(/^act_/, ""));
const pathPattern =
  /^\/(?:oauth\/access_token|debug_token|(?:me|act_\d{1,80}|\d{1,80})(?:\/(?:adaccounts|campaigns|adsets|ads|adcreatives|adimages|advideos|previews|promote_pages|insights|subscriptions|subscribed_apps|leadgen_forms|leads|test_leads))?)$/;
function assertPath(path: string) {
  if (!pathPattern.test(path))
    throw new AdProviderError("invalid_link", "Caminho Graph não permitido.");
}
function providerCode(status: number, code?: number): AdErrorCode {
  if (code === 190 || status === 401) return "token_expired";
  if ([4, 17, 32, 613, 80004].includes(code ?? 0) || status === 429) return "rate_limited";
  if ([10, 200, 294].includes(code ?? 0) || status === 403) return "no_permission";
  if ([100, 2500].includes(code ?? 0)) return "invalid_parameter";
  // A generic Graph parameter failure is not evidence that a campaign does not exist.
  return "provider_error";
}
export function safeNextUrl(next: string): URL {
  let url: URL;
  try {
    url = new URL(next);
  } catch {
    throw new AdProviderError("provider_error", "Paginação inválida.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "graph.facebook.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(`/${metaGraphVersion()}/`)
  )
    throw new AdProviderError("provider_error", "Paginação inválida.");
  assertPath(url.pathname.slice(metaGraphVersion().length + 1));
  for (const key of [
    "access_token",
    "appsecret_proof",
    "input_token",
    "client_secret",
    "fb_exchange_token",
    "code",
  ])
    url.searchParams.delete(key);
  return url;
}
export type MetaGraphOptions = {
  operation?: AdRequestDiagnostics["operation"];
  /** Stable connection/account ID, never user-supplied before authorization. */
  scopeKey?: string;
  readRetries?: 0 | 1 | 2;
  onTelemetry?: (diagnostics: AdRequestDiagnostics) => void;
};
type Gate = {
  active: number;
  waiting: Array<() => void>;
  failures: number;
  blockedUntil: number;
  blockedCode?: AdErrorCode;
  touched: number;
};
// Cross-process serialization is the database lease; this protects each runtime as well.
const gates = new Map<string, Gate>();
export function resetMetaGraphTransportState() {
  gates.clear();
}
function gateFor(token: string, scope?: string) {
  const key = createHash("sha256")
    .update(token)
    .update(scope ?? "")
    .digest("hex");
  const now = Date.now();
  for (const [id, state] of gates)
    if (!state.active && !state.waiting.length && now - state.touched > 900_000) gates.delete(id);
  let gate = gates.get(key);
  if (!gate) {
    gate = { active: 0, waiting: [], failures: 0, blockedUntil: 0, touched: now };
    gates.set(key, gate);
  }
  gate.touched = now;
  return gate;
}
async function acquire(gate: Gate) {
  if (gate.blockedUntil > Date.now()) {
    const code = gate.blockedCode ?? "rate_limited";
    throw new AdProviderError(code, AD_ERROR_MESSAGES[code]);
  }
  if (gate.active >= 2) {
    if (gate.waiting.length >= 32)
      throw new AdProviderError("rate_limited", AD_ERROR_MESSAGES.rate_limited);
    await new Promise<void>((resolve) => gate.waiting.push(resolve));
  } else gate.active++;
}
function release(gate: Gate) {
  const next = gate.waiting.shift();
  if (next) next();
  else gate.active--;
}
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
function diagnostics(
  response: Response,
  operation: AdRequestDiagnostics["operation"],
  error?: Record<string, unknown>,
): AdRequestDiagnostics {
  const retry = response.headers.get("retry-after");
  const retryAfterSeconds = retry
    ? /^\d+$/.test(retry)
      ? Number(retry)
      : Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
    : undefined;
  const requestId = error?.fbtrace_id ?? response.headers.get("x-fb-request-id");
  let usage: AdRequestDiagnostics["usage"];
  try {
    const raw = JSON.parse(response.headers.get("x-app-usage") ?? "null");
    if (raw && typeof raw === "object")
      usage = {
        callCount: number(raw.call_count),
        cpuTime: number(raw.total_cputime),
        totalTime: number(raw.total_time),
      };
    const business = JSON.parse(response.headers.get("x-business-use-case-usage") ?? "null");
    const regain =
      business && typeof business === "object"
        ? Object.values(business)
            .flatMap((v) => (Array.isArray(v) ? v : []))
            .map((v) => number(v?.estimated_time_to_regain_access))
            .filter((v): v is number => v !== undefined)
        : [];
    if (regain.length) usage = { ...usage, regainSeconds: Math.max(...regain) * 60 };
  } catch {
    /* untrusted usage headers are optional diagnostics */
  }
  return {
    operation,
    httpStatus: response.status,
    providerCode: number(error?.code),
    providerSubcode: number(error?.error_subcode),
    requestId:
      typeof requestId === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(requestId)
        ? requestId
        : undefined,
    transient: typeof error?.is_transient === "boolean" ? error.is_transient : undefined,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? Math.min(retryAfterSeconds!, 86400)
      : undefined,
    usage,
  };
}
export function metaRetryDelayMs(
  attempt: number,
  retryAfterSeconds?: number,
  random = Math.random,
): number {
  return Math.min(
    60_000,
    Math.max((retryAfterSeconds ?? 0) * 1000, 500 * 2 ** Math.min(attempt, 6) * (0.5 + random())),
  );
}
export async function metaGraph<T>(
  path: string | URL,
  token: string,
  params: Record<string, string> = {},
  init: RequestInit = {},
  options: MetaGraphOptions = {},
): Promise<T> {
  if (typeof path === "string") assertPath(path);
  const url =
    path instanceof URL
      ? safeNextUrl(path.href)
      : new URL(`https://graph.facebook.com/${metaGraphVersion()}${path}`);
  const method = (init.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method))
    throw new AdProviderError("invalid_parameter", AD_ERROR_MESSAGES.invalid_parameter);
  const operation = options.operation ?? (method === "GET" ? "read" : "command");
  if (operation === "read" && method !== "GET")
    throw new AdProviderError("invalid_parameter", AD_ERROR_MESSAGES.invalid_parameter);
  for (const [key, value] of Object.entries(params)) {
    // debug_token is the one documented read that requires the inspected token as a parameter.
    if (
      ["access_token", "client_secret", "fb_exchange_token", "appsecret_proof"].includes(key) ||
      (key === "input_token" && path !== "/debug_token")
    )
      throw new AdProviderError("invalid_parameter", "Credencial não permitida neste parâmetro.");
    url.searchParams.set(key, value);
  }
  const gate = gateFor(
    token,
    path === "/debug_token"
      ? `${options.scopeKey ?? ""}:${createHash("sha256")
          .update(params.input_token ?? "")
          .digest("hex")}`
      : options.scopeKey,
  );
  await acquire(gate);
  try {
    const retries = method === "GET" && operation === "read" ? (options.readRetries ?? 0) : 0;
    for (let attempt = 0; ; attempt++) {
      try {
        // Waiters must re-check a circuit opened while they were queued.
        if (gate.blockedUntil > Date.now())
          throw new AdProviderError(
            gate.blockedCode ?? "rate_limited",
            AD_ERROR_MESSAGES[gate.blockedCode ?? "rate_limited"],
          );
        let response: Response;
        try {
          const headers = Object.fromEntries(new Headers(init.headers).entries());
          response = await fetch(url, {
            ...init,
            method,
            redirect: "manual",
            headers: { ...headers, Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15_000),
          });
        } catch {
          const code = method === "GET" ? "provider_error" : "outcome_uncertain";
          throw new AdProviderError(
            code,
            method === "GET" ? "A Meta não respondeu no prazo." : AD_ERROR_MESSAGES[code],
            { operation, transient: true },
          );
        }
        const body = (await response.json().catch(() => null)) as
          | (T & { error?: Record<string, unknown> })
          | null;
        const info = diagnostics(response, operation, body?.error);
        options.onTelemetry?.(info);
        if (
          (response.status >= 300 && response.status < 400) ||
          !body ||
          typeof body !== "object"
        ) {
          const code = method === "GET" ? "provider_error" : "outcome_uncertain";
          throw new AdProviderError(code, AD_ERROR_MESSAGES[code], info);
        }
        if (!response.ok || body.error) {
          const code =
            method !== "GET" && response.status >= 500 && !body.error
              ? "outcome_uncertain"
              : providerCode(response.status, number(body.error?.code));
          throw new AdProviderError(code, AD_ERROR_MESSAGES[code], info);
        }
        gate.failures = 0;
        return body;
      } catch (error) {
        if (!(error instanceof AdProviderError))
          throw new AdProviderError(
            method === "GET" ? "provider_error" : "outcome_uncertain",
            AD_ERROR_MESSAGES[method === "GET" ? "provider_error" : "outcome_uncertain"],
          );
        const retryable =
          error.code === "rate_limited" ||
          error.diagnostics?.transient === true ||
          (error.diagnostics?.httpStatus ?? 0) >= 500;
        if (retryable && attempt < retries && (error.diagnostics?.retryAfterSeconds ?? 0) <= 10) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(10_000, metaRetryDelayMs(attempt, error.diagnostics?.retryAfterSeconds)),
            ),
          );
          continue;
        }
        if (error.code === "token_expired") {
          gate.blockedUntil = Date.now() + 300_000;
          gate.blockedCode = "token_expired";
        } else if (retryable || error.code === "provider_error") {
          gate.failures++;
          if (error.code === "rate_limited" || gate.failures >= 3) {
            gate.blockedUntil =
              Date.now() + metaRetryDelayMs(gate.failures, error.diagnostics?.retryAfterSeconds);
            gate.blockedCode = "rate_limited";
          }
        }
        throw error;
      }
    }
  } finally {
    release(gate);
  }
}
/** POSTs are never retried; callers durably record an uncertain outcome before reconciliation. */
export function metaGraphCommand<T>(
  path: string,
  token: string,
  payload: Record<string, string>,
  options: MetaGraphOptions = {},
): Promise<T> {
  return metaGraph<T>(
    path,
    token,
    {},
    { method: "POST", body: new URLSearchParams(payload) },
    { ...options, operation: options.operation === "report" ? "report" : "command" },
  );
}
export async function metaPages<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  options: MetaGraphOptions = {},
): Promise<T[]> {
  const rows: T[] = [],
    seen = new Set<string>();
  let next: string | URL = path,
    pageCount = 0;
  const started = Date.now();
  while (next) {
    const key = typeof next === "string" ? next : next.href;
    if (
      seen.has(key) ||
      ++pageCount > 1000 ||
      rows.length > 100_000 ||
      Date.now() - started > 90_000
    )
      throw new AdProviderError(
        "partial_data",
        "Limite operacional de paginação; dados não confirmados.",
      );
    seen.add(key);
    const page: { data?: T[]; paging?: { next?: string } } = await metaGraph(
      next,
      token,
      pageCount === 1 ? { limit: "100", ...params } : {},
      {},
      options,
    );
    if (!Array.isArray(page.data))
      throw new AdProviderError("provider_error", "Página de resultados inválida.");
    rows.push(...page.data);
    if (!page.paging?.next) break;
    next = safeNextUrl(page.paging.next);
    // A cursor can only continue the same resource, never change account/entity/path.
    if (next.pathname !== `/${metaGraphVersion()}${path}`)
      throw new AdProviderError("no_permission", "A paginação mudou de recurso.");
  }
  return rows;
}
