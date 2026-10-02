/**
 * Decodificação e interpretação do retorno síncrono do WNERestServiceNFSe.
 * Puro (sem imports de servidor) para testes com `node --test`.
 */
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

export type NfseResponseKind = "sucesso" | "teste_ok" | "recusa" | "ilegivel";

export type NfseParsedResponse = {
  kind: NfseResponseKind;
  ok: boolean;
  testeValidado: boolean;
  numeroNfse: string | null;
  serieNfse: string | null;
  dataNfse: string | null;
  horaNfse: string | null;
  situacaoCodigo: string | null;
  situacaoDescricao: string | null;
  codigoVerificador: string | null;
  linkPdf: string | null;
  /** Mensagem legível (todas as mensagens, separadas por " · "). */
  mensagem: string | null;
  mensagens: string[];
  /** Códigos de crítica (ex.: "00383"). */
  codigosErro: string[];
};

/** Charset do Content-Type, senão do prólogo XML; padrão ISO-8859-1. */
export function detectCharset(bytes: Uint8Array, contentType?: string | null): string {
  const fromHeader = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? "")?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const fromProlog = /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1];
  if (fromProlog) return fromProlog.toLowerCase();
  return "iso-8859-1";
}

export function decodeResponse(buffer: ArrayBuffer | Uint8Array, contentType?: string | null): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const charset = detectCharset(bytes, contentType);
  try {
    return new TextDecoder(charset === "utf8" ? "utf-8" : charset).decode(bytes);
  } catch {
    return new TextDecoder("iso-8859-1").decode(bytes);
  }
}

const scalar = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v).trim())
  .nullish()
  .catch(null);

const mensagemSchema = z
  .object({ codigo: z.unknown().optional(), descricao: z.unknown().optional() })
  .passthrough();

const retornoSchema = z
  .object({
    mensagem: z.unknown().optional(),
    numero_nfse: scalar,
    serie_nfse: scalar,
    data_nfse: scalar,
    hora_nfse: scalar,
    situacao_codigo_nfse: scalar,
    situacao_descricao_nfse: scalar,
    link_nfse: scalar,
    cod_verificador_autenticidade: scalar,
    codigo_verificacao: scalar,
  })
  .passthrough();

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | null {
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    return s || null;
  }
  return null;
}

const TESTE_OK = /v[áa]lida\s+para\s+emiss[ãa]o/i;
const CODIGO_ERRO = /^(\d{3,6})(?:\s*-\s*([\s\S]*))?$/;

function empty(kind: NfseResponseKind, mensagem: string | null = null): NfseParsedResponse {
  return {
    kind,
    ok: false,
    testeValidado: false,
    numeroNfse: null,
    serieNfse: null,
    dataNfse: null,
    horaNfse: null,
    situacaoCodigo: null,
    situacaoDescricao: null,
    codigoVerificador: null,
    linkPdf: null,
    mensagem,
    mensagens: mensagem ? [mensagem] : [],
    codigosErro: [],
  };
}

/** {"retorno":{"msg":"Acesso Negado!","code":401}} */
function parseJson(text: string): NfseParsedResponse | null {
  if (!text.startsWith("{")) return null;
  try {
    const data = JSON.parse(text) as { retorno?: Record<string, unknown> };
    const r = data?.retorno;
    if (!r || typeof r !== "object") return empty("ilegivel");
    const mensagem = str(r["msg"]) ?? str(r["mensagem"]);
    const code = str(r["code"]) ?? str(r["codigo"]);
    const testeValidado = TESTE_OK.test(mensagem ?? "");
    const isError = code !== null && Number(code) >= 400;
    const base = empty(isError ? "recusa" : testeValidado ? "teste_ok" : "ilegivel", mensagem);
    return {
      ...base,
      ok: !isError && testeValidado,
      testeValidado,
      codigosErro: isError && code ? [code] : [],
    };
  } catch {
    return empty("ilegivel");
  }
}

export function parseNfseResponse(raw: string): NfseParsedResponse {
  const text = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) return empty("ilegivel");
  const json = parseJson(text);
  if (json) return json;
  if (!text.startsWith("<") || /^<!doctype html|^<html/i.test(text)) return empty("ilegivel");

  let doc: Record<string, unknown>;
  try {
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
    doc = parser.parse(text) as Record<string, unknown>;
  } catch {
    return empty("ilegivel");
  }
  const parsedRetorno = retornoSchema.safeParse(doc?.["retorno"]);
  if (!parsedRetorno.success) return empty("ilegivel");
  const r = parsedRetorno.data;

  const mensagens: string[] = [];
  const codigosErro: string[] = [];
  let testeValidado = false;
  for (const m of toArray(r.mensagem as unknown)) {
    const pm = mensagemSchema.safeParse(m);
    const codigos = pm.success ? toArray(pm.data.codigo as unknown).map(str) : [str(m)];
    const descricao = pm.success ? str(pm.data.descricao) : null;
    for (const c of codigos) {
      if (!c) continue;
      const match = CODIGO_ERRO.exec(c);
      if (match) {
        codigosErro.push(match[1] as string);
        mensagens.push(match[2]?.trim() ? `${match[1]} - ${match[2].trim()}` : descricao ? `${match[1]} - ${descricao}` : c);
      } else {
        if (TESTE_OK.test(c)) testeValidado = true;
        mensagens.push(c);
      }
    }
  }

  const numeroNfse = r.numero_nfse ?? null;
  const base: NfseParsedResponse = {
    kind: "ilegivel",
    ok: false,
    testeValidado,
    numeroNfse,
    serieNfse: r.serie_nfse ?? null,
    dataNfse: r.data_nfse ?? null,
    horaNfse: r.hora_nfse ?? null,
    situacaoCodigo: r.situacao_codigo_nfse ?? null,
    situacaoDescricao: r.situacao_descricao_nfse ?? null,
    codigoVerificador: r.cod_verificador_autenticidade ?? r.codigo_verificacao ?? null,
    linkPdf: r.link_nfse ?? null,
    mensagem: mensagens.length ? mensagens.join(" · ") : null,
    mensagens,
    codigosErro,
  };
  if (codigosErro.length) return { ...base, kind: "recusa" };
  if (testeValidado) return { ...base, kind: "teste_ok", ok: true };
  if (numeroNfse) return { ...base, kind: "sucesso", ok: true };
  return base;
}
