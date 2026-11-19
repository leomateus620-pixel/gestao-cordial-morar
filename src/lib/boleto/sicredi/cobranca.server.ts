/** Server-only Sicredi Cobrança operations used by the Gestão (no instruction commands yet). */
import type { CadastroBody } from "./body";
import { sicrediUrls, type SicrediCredentials } from "./config.server";
import { sicrediRequest, SicrediError, type FetchLike } from "./http.server";
import { isValidBarcode, isValidLinhaDigitavel } from "./linha-digitavel";
import { forgetSicrediToken, getSicrediToken, type TokenDeps } from "./token.server";

export type CadastroResult = {
  nossoNumero: string;
  linhaDigitavel: string;
  codigoBarras: string;
};
export type ConsultaResult = {
  situacao: string | null;
  nossoNumero: string | null;
  seuNumero: string | null;
  dataPagamento: string | null;
  valorLiquidado: number | null;
};
export type LiquidadoItem = {
  nossoNumero: string;
  seuNumero: string | null;
  dataPagamento: string | null;
  valor: number | null;
  valorLiquidado: number | null;
};

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const numOrNull = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Validates the registration answer; anything off is treated as an uncertain outcome.
 * Production checks every FEBRABAN check digit. The sandbox answers fixed demo data whose
 * check digits are not valid, so there only the shape (9/47/44 digits) is checked.
 */
export function parseCadastroResponse(body: unknown, strictDv = true): CadastroResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const nossoNumero = (str(b.nossoNumero) ?? "").replace(/\D/g, "");
  const linhaDigitavel = (str(b.linhaDigitavel) ?? "").replace(/\D/g, "");
  const codigoBarras = (str(b.codigoBarras) ?? "").replace(/\D/g, "");
  const valid = strictDv
    ? isValidLinhaDigitavel(linhaDigitavel) && isValidBarcode(codigoBarras)
    : /^\d{47}$/.test(linhaDigitavel) && /^\d{44}$/.test(codigoBarras);
  if (!/^\d{1,20}$/.test(nossoNumero) || !valid)
    throw new SicrediError(
      "corpo_invalido",
      200,
      "O Sicredi respondeu ao cadastro sem nosso número, linha digitável ou código de barras válidos.",
    );
  return { nossoNumero, linhaDigitavel, codigoBarras };
}

export function sicrediCobranca(
  c: SicrediCredentials,
  deps: TokenDeps & { sleepImpl?: (ms: number) => Promise<void> } = {},
) {
  const base = sicrediUrls(c.ambiente).cobranca;
  async function headers(json: boolean) {
    const token = await getSicrediToken(c, deps);
    return {
      Authorization: `Bearer ${token}`,
      "x-api-key": c.apiKey,
      cooperativa: c.cooperativa,
      posto: c.posto,
      Accept: json ? "application/json" : "application/pdf, application/octet-stream",
      ...(json ? { "Content-Type": "application/json" } : {}),
    };
  }
  /** GET with one token renewal on 401 (token revoked before its expiry). */
  async function get(op: string, path: string, query: Record<string, string>, binary = false) {
    const url = `${base}${path}?${new URLSearchParams(query).toString()}`;
    for (let attempt = 0; ; attempt++) {
      try {
        return await sicrediRequest({
          fetchImpl: deps.fetchImpl,
          sleepImpl: deps.sleepImpl,
          op,
          method: "GET",
          url,
          headers: await headers(!binary),
          binary,
        });
      } catch (e) {
        if (attempt === 0 && e instanceof SicrediError && e.status === 401) {
          await forgetSicrediToken(c);
          continue;
        }
        throw e;
      }
    }
  }
  return {
    /** Single POST, never retried; the caller records uncertainty on timeout/5xx. */
    async cadastrar(body: CadastroBody): Promise<CadastroResult> {
      if (body.codigoBeneficiario !== c.codigoBeneficiario)
        throw new Error("Conta do boleto não corresponde à credencial.");
      const res = await sicrediRequest({
        fetchImpl: deps.fetchImpl,
        op: "cadastrar o boleto",
        method: "POST",
        url: `${base}/boletos`,
        headers: await headers(true),
        body: JSON.stringify(body),
      });
      return parseCadastroResponse(res.body, c.ambiente === "producao");
    },
    async consultar(nossoNumero: string): Promise<ConsultaResult> {
      const res = await get("consultar o boleto", "/boletos", {
        codigoBeneficiario: c.codigoBeneficiario,
        nossoNumero,
      });
      const b = (res.body ?? {}) as Record<string, unknown>;
      const dados = (b.dadosLiquidacao ?? {}) as Record<string, unknown>;
      return {
        situacao: str(b.situacao),
        nossoNumero: str(b.nossoNumero),
        seuNumero: str(b.seuNumero),
        dataPagamento: str(dados.data ?? b.dataPagamento),
        valorLiquidado: numOrNull(dados.valor ?? b.valorLiquidado),
      };
    },
    /** Titles registered in the last 48h by seuNumero (production only per the manual). */
    async cadastrados(seuNumero: string): Promise<CadastroResult[]> {
      const res = await get("consultar títulos cadastrados", "/boletos/cadastrados", {
        codigoBeneficiario: c.codigoBeneficiario,
        seuNumero,
      });
      const raw = res.body as unknown;
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
          ? (raw as { items: unknown[] }).items
          : raw && typeof raw === "object"
            ? [raw]
            : [];
      const out: CadastroResult[] = [];
      for (const item of list) {
        try {
          out.push(parseCadastroResponse(item, c.ambiente === "producao"));
        } catch {
          /* ignore incomplete rows */
        }
      }
      return out;
    },
    async pdf(linhaDigitavel: string): Promise<Uint8Array> {
      const res = await get("obter o PDF do boleto", "/boletos/pdf", { linhaDigitavel }, true);
      const bytes = res.bytes ?? new Uint8Array();
      if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new SicrediError(
          "corpo_invalido",
          res.status,
          "O Sicredi não devolveu um PDF válido.",
        );
      if (bytes.length > 5 * 1024 * 1024)
        throw new SicrediError(
          "corpo_invalido",
          res.status,
          "PDF do boleto maior que o permitido.",
        );
      return bytes;
    },
    async liquidadosDia(
      diaIso: string,
      pagina = 0,
    ): Promise<{ items: LiquidadoItem[]; hasNext: boolean }> {
      const res = await get("consultar liquidados do dia", "/boletos/liquidados/dia", {
        codigoBeneficiario: c.codigoBeneficiario,
        dia: brDate(diaIso),
        pagina: String(pagina),
      });
      const b = (res.body ?? {}) as Record<string, unknown>;
      const items = (
        Array.isArray(b.items) ? b.items : Array.isArray(res.body) ? (res.body as unknown[]) : []
      )
        .map((i) => (i ?? {}) as Record<string, unknown>)
        .map((i) => ({
          nossoNumero: (str(i.nossoNumero) ?? "").replace(/\D/g, ""),
          seuNumero: str(i.seuNumero),
          dataPagamento: str(i.dataPagamento),
          valor: numOrNull(i.valor),
          valorLiquidado: numOrNull(i.valorLiquidado ?? i.valor),
        }))
        .filter((i) => i.nossoNumero);
      return { items, hasNext: b.hasNext === true };
    },
  };
}
export type SicrediCobrancaClient = ReturnType<typeof sicrediCobranca>;
