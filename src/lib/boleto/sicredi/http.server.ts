/** Server-only HTTP layer for Sicredi: timeout, no redirects, normalized Portuguese errors. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type SicrediErrorKind = "timeout" | "rede" | "http" | "redirect" | "corpo_invalido";

export class SicrediError extends Error {
  readonly kind: SicrediErrorKind;
  readonly status: number | null;
  /** True when the bank may have processed the request (timeout, network, 5xx, bad body). */
  readonly incerto: boolean;
  constructor(kind: SicrediErrorKind, status: number | null, message: string) {
    super(message);
    this.name = "SicrediError";
    this.kind = kind;
    this.status = status;
    this.incerto = kind === "timeout" || kind === "rede" || kind === "corpo_invalido" || (status ?? 0) >= 500;
  }
}

export const SICREDI_TIMEOUT_MS = 15_000;
const MAX_429_RETRIES = 2;

/** Removes long digit runs (documents, codes, linha) and bearer-looking tokens. */
export function sanitizeBankMessage(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?/g, "[token]")
    .replace(/\d{6,}/g, (m) => `${"•".repeat(Math.min(m.length, 6))}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function bankDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  const msg = b.message ?? b.mensagem ?? b.error_description ?? b.detail ?? b.error;
  const first = Array.isArray(b.errors) ? (b.errors[0] as Record<string, unknown> | undefined) : undefined;
  return sanitizeBankMessage(
    typeof msg === "string" ? msg : typeof first?.message === "string" ? first.message : "",
  );
}

export function httpErrorMessage(status: number, body: unknown, op: string): string {
  const detail = bankDetail(body);
  const suffix = detail ? ` Detalhe do banco: ${detail}` : "";
  if (status === 400) return `O Sicredi recusou os dados ao ${op} (400).${suffix}`;
  if (status === 401)
    return `Autenticação recusada pelo Sicredi ao ${op} (401). Confira a chave da aplicação e o código de acesso.${suffix}`;
  if (status === 403) return `Acesso negado pelo Sicredi ao ${op} (403).${suffix}`;
  if (status === 404) return `Não encontrado no Sicredi ao ${op} (404).${suffix}`;
  if (status === 415) return `Formato não aceito pelo Sicredi ao ${op} (415).`;
  if (status === 422) return `O Sicredi não aceitou a operação ao ${op} (422).${suffix}`;
  if (status === 429) return `Limite de requisições do Sicredi atingido ao ${op} (429). Aguarde e tente de novo.`;
  if (status >= 500) return `O Sicredi está indisponível ao ${op} (${status}). Tente mais tarde.`;
  return `Resposta inesperada do Sicredi ao ${op} (${status}).${suffix}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SicrediResponse = { status: number; body: unknown; bytes?: Uint8Array };

/**
 * One request. GET may wait and retry on 429 (bounded); POST never retries.
 * Logs carry only the operation and status — never URLs with queries, tokens or bodies.
 */
export async function sicrediRequest(args: {
  fetchImpl?: FetchLike;
  op: string;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  binary?: boolean;
  timeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<SicrediResponse> {
  const fetchImpl = args.fetchImpl ?? ((i, init) => fetch(i, init));
  const wait = args.sleepImpl ?? sleep;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? SICREDI_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(args.url, {
        method: args.method,
        headers: args.headers,
        body: args.body,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = (e as { name?: string })?.name === "AbortError" || controller.signal.aborted;
      console.warn(`[sicredi] ${args.op}: ${aborted ? "timeout" : "falha de rede"}`);
      throw aborted
        ? new SicrediError("timeout", null, `O Sicredi não respondeu em ${Math.round((args.timeoutMs ?? SICREDI_TIMEOUT_MS) / 1000)} s ao ${args.op}.`)
        : new SicrediError("rede", null, `Não foi possível falar com o Sicredi ao ${args.op}.`);
    }
    try {
      if (res.status >= 300 && res.status < 400) {
        console.warn(`[sicredi] ${args.op}: redirecionamento ${res.status} recusado`);
        throw new SicrediError("redirect", res.status, `Resposta inesperada do Sicredi ao ${args.op} (${res.status}).`);
      }
      if (res.status === 429 && args.method === "GET" && attempt < MAX_429_RETRIES) {
        const ra = Number(res.headers.get("retry-after"));
        console.warn(`[sicredi] ${args.op}: 429, nova tentativa ${attempt + 1}`);
        await res.body?.cancel().catch(() => undefined);
        await wait(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt, 5000));
        continue;
      }
      if (res.ok && args.binary) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, body: null, bytes };
      }
      const text = await res.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
          if (res.ok) {
            console.warn(`[sicredi] ${args.op}: corpo não é JSON (${res.status})`);
            throw new SicrediError("corpo_invalido", res.status, `Resposta ilegível do Sicredi ao ${args.op}.`);
          }
        }
      }
      if (!res.ok) {
        console.warn(`[sicredi] ${args.op}: HTTP ${res.status}`);
        throw new SicrediError("http", res.status, httpErrorMessage(res.status, body, args.op));
      }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }
}
