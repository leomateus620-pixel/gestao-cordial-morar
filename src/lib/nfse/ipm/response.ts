/**
 * Decodificação e interpretação do retorno síncrono do WNERestServiceNFSe.
 * Puro (sem imports de servidor) para testes com `node --test`.
 */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { normalizeTaxDoc } from "./xml";

export const NFSE_PARSER_VERSION = "ipm-2026-10-v2";

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
  identificador: string | null;
  cnpjPrestador: string | null;
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

export function decodeResponse(
  buffer: ArrayBuffer | Uint8Array,
  contentType?: string | null,
): string {
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

const TESTE_OK = /^NFS-?e\s+v[áa]lida\s+para\s+emiss[ãa]o\.?$/i;
const CODIGO_ERRO = /^(\d{3,6})(?:\s*-\s*([\s\S]*))?$/;

/** Link fiscal recebido também é entrada externa; nunca publicar destinos arbitrários. */
export function safeNfseDocumentUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(String(value ?? ""));
    if (
      url.protocol !== "https:" ||
      url.hostname !== "santarosa.atende.net" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

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
    identificador: null,
    cnpjPrestador: null,
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
    const isRefusal = isError && Number(code) < 500;
    const base = empty(
      isRefusal ? "recusa" : !isError && testeValidado ? "teste_ok" : "ilegivel",
      mensagem,
    );
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
  const text = String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (!text || text.length > 1_048_576) return empty("ilegivel");
  const json = parseJson(text);
  if (json) return json;
  if (!text.startsWith("<") || /<!DOCTYPE|<!ENTITY|^<html/i.test(text)) return empty("ilegivel");

  let doc: Record<string, unknown>;
  try {
    if (XMLValidator.validate(text) !== true) return empty("ilegivel");
    // DTD e ENTITY já foram recusados; apenas entidades XML predefinidas são decodificadas.
    const parser = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: false,
      trimValues: true,
      processEntities: true,
    });
    doc = parser.parse(text) as Record<string, unknown>;
  } catch {
    return empty("ilegivel");
  }
  if (!doc || typeof doc !== "object") return empty("ilegivel");
  // Somente caminhos documentados, sem procura recursiva por qualquer numero_nfse.
  const root = record(doc["retorno"]) ?? record(doc["nfse"]);
  if (!root) return empty("ilegivel");
  if (Array.isArray(root["nfse"])) return empty("ilegivel");
  const nfse = record(root["nfse"]) ?? root;
  const nfe = record(nfse["nfe"]) ?? record(nfse["nf"]);
  const sources = [root, nfse, nfe].filter((v): v is Record<string, unknown> => Boolean(v));
  const merged: Record<string, unknown> = {};
  const fields = [
    "numero_nfse",
    "serie_nfse",
    "data_nfse",
    "hora_nfse",
    "situacao_codigo_nfse",
    "situacao_descricao_nfse",
    "link_nfse",
    "cod_verificador_autenticidade",
    "codigo_verificacao",
  ];
  for (const field of fields) {
    const values = [...new Set(sources.map((source) => str(source[field])).filter(Boolean))];
    if (values.length > 1) return empty("ilegivel");
    merged[field] = values[0] ?? null;
  }
  merged["mensagem"] = [...new Set(sources)].flatMap((source) => toArray(source["mensagem"]));
  const parsedRetorno = retornoSchema.safeParse(merged);
  if (!parsedRetorno.success) return empty("ilegivel");
  const r = parsedRetorno.data;

  const mensagens: string[] = [];
  const codigosErro: string[] = [];
  let testeValidado = false;
  for (const m of toArray(r.mensagem as unknown)) {
    const pm = mensagemSchema.safeParse(m);
    const codigos = pm.success ? toArray(pm.data.codigo as unknown).map(str) : [str(m)];
    const descricao = pm.success ? str(pm.data.descricao) : null;
    if (codigos.every((c) => !c) && descricao) codigos.push(descricao);
    for (const c of codigos) {
      if (!c) continue;
      const match = CODIGO_ERRO.exec(c);
      if (match) {
        codigosErro.push(match[1] as string);
        const texto = match[2]?.trim() || (descricao && descricao !== c ? descricao : "");
        mensagens.push(texto ? `${match[1]} - ${texto}` : c);
      } else if (TESTE_OK.test(c)) {
        testeValidado = true;
        mensagens.push(c);
      } else {
        const xsd = /XSD\s*Error\s*(\d+)/i.exec(c);
        codigosErro.push(xsd ? `XSD-${xsd[1]}` : "TEXTO");
        mensagens.push(descricao && descricao !== c ? `${c} - ${descricao}` : c);
      }
    }
  }

  const numeroNfse =
    r.numero_nfse && /^\d+$/.test(r.numero_nfse) && /[1-9]/.test(r.numero_nfse)
      ? r.numero_nfse
      : null;
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
    identificador: str(nfse["identificador"]),
    cnpjPrestador: normalizeTaxDoc(str(record(nfse["prestador"])?.["cpfcnpj"])) || null,
    linkPdf: safeNfseDocumentUrl(r.link_nfse),
    mensagem: mensagens.length ? mensagens.join(" · ") : null,
    mensagens,
    codigosErro,
  };
  // Ordem importa: com número a nota existe — nunca é recusa.
  if (testeValidado && codigosErro.length === 0) return { ...base, kind: "teste_ok", ok: true };
  if (testeValidado) return base; // mensagens contraditórias não confirmam teste nem emissão real.
  if (numeroNfse) return { ...base, kind: "sucesso", ok: true };
  // Texto de espera/duplicidade não comprova rejeição anterior à emissão.
  if (
    mensagens.some((message) =>
      /processando|processad[oa]|aguard|j[áa].*(?:identificador|nota)|identificador.*(?:repetid|exist)|timeout|indispon[ií]vel/i.test(
        message,
      ),
    )
  )
    return base;
  if (
    codigosErro.some((code) => code !== "TEXTO") ||
    mensagens.some((message) =>
      /acesso negado|inv[áa]lid[oa]|n[ãa]o autorizad[oa]|recusad[oa]/i.test(message),
    )
  )
    return { ...base, kind: "recusa" };
  return base; // <retorno> sem mensagem e sem número → ilegível (incerto)
}
