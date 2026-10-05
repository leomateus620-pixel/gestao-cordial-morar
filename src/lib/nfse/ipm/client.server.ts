import { NFSE_TIMEOUT_MS } from "../emission-rules";
import { isAllowedEndpoint, isValidTaxDoc, normalizeTaxDoc } from "../validation";
import {
  decodeResponse,
  NFSE_PARSER_VERSION,
  parseNfseResponse,
  type NfseParsedResponse,
} from "./response";

export const NFSE_MAX_RESPONSE_BYTES = 1_048_576;

export type PostNfseInput = {
  endpointUrl: string;
  login: string;
  senha: string;
  cidade: string;
  xml: string;
  timeoutMs?: number;
};

export type PostNfseResult = {
  transport: "ok" | "timeout" | "rede" | "nao_enviado";
  parsed: NfseParsedResponse;
  httpStatus: number | null;
  raw: string;
  durationMs: number;
  parserVersion: string;
  responseComplete: boolean;
  /** Mensagem de falha de transporte (nunca contém credenciais). */
  transportError: string | null;
};

/** Monta o cabeçalho HTTP Basic exigido pela IPM (NT 35/2021 v2.9). */
export function buildBasicAuthHeader(login: string, senha: string): string {
  const user = normalizeTaxDoc(login);
  if (!isValidTaxDoc(user) || !senha) throw new Error("Credenciais fiscais inválidas.");
  return `Basic ${Buffer.from(`${user}:${senha}`, "utf-8").toString("base64")}`;
}

/**
 * Envio síncrono ao WNERestServiceNFSe. Nunca lança: falhas de transporte
 * voltam como transport="timeout"/"rede" para serem gravadas como "incerto".
 */
export async function postNfse(input: PostNfseInput): Promise<PostNfseResult> {
  const started = Date.now();
  const failure = (
    transport: PostNfseResult["transport"],
    transportError: string,
    httpStatus: number | null = null,
    raw = "",
  ): PostNfseResult => ({
    transport,
    parsed: parseNfseResponse(""),
    httpStatus,
    raw,
    durationMs: Date.now() - started,
    parserVersion: NFSE_PARSER_VERSION,
    responseComplete: false,
    transportError,
  });
  // Defesa no limite de transporte: nunca confie somente na validação do formulário.
  if (!isAllowedEndpoint(input.endpointUrl))
    return failure("nao_enviado", "Destino fiscal não autorizado. Revise a configuração.");
  if (
    !/^\d{1,9}$/.test(input.cidade) ||
    !input.xml ||
    new TextEncoder().encode(input.xml).length > NFSE_MAX_RESPONSE_BYTES
  )
    return failure("nao_enviado", "Dados de transmissão inválidos. Revise a operação.");
  let authorization: string;
  try {
    authorization = buildBasicAuthHeader(input.login, input.senha);
  } catch {
    return failure("nao_enviado", "Credenciais fiscais inválidas. Revise a configuração.");
  }
  const form = new FormData();
  form.append("cidade", input.cidade);
  form.append("f1", new Blob([input.xml], { type: "text/xml; charset=utf-8" }), "nfse.xml");

  const controller = new AbortController();
  const requestedTimeout = input.timeoutMs ?? NFSE_TIMEOUT_MS;
  const boundedTimeout = Number.isFinite(requestedTimeout)
    ? Math.max(1, Math.min(requestedTimeout, NFSE_TIMEOUT_MS))
    : NFSE_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), boundedTimeout);
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const rawSoFar = () => {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return decodeResponse(bytes, contentType);
  };
  try {
    const response = await fetch(input.endpointUrl, {
      method: "POST",
      headers: { Authorization: authorization },
      body: form,
      signal: controller.signal,
      redirect: "manual",
      credentials: "omit",
    });
    httpStatus = response.status;
    contentType = response.headers.get("content-type");
    if (httpStatus >= 300 && httpStatus < 400) {
      await response.body?.cancel();
      return failure(
        "rede",
        "A prefeitura retornou um redirecionamento. É necessária conferência.",
        httpStatus,
      );
    }
    if (Number(response.headers.get("content-length")) > NFSE_MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      return failure(
        "rede",
        "A resposta da prefeitura excedeu o limite. É necessária conferência.",
        httpStatus,
      );
    }
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.length > NFSE_MAX_RESPONSE_BYTES) {
          const remaining = NFSE_MAX_RESPONSE_BYTES - size;
          chunks.push(value.slice(0, remaining));
          size += remaining;
          await reader.cancel();
          return failure(
            "rede",
            "A resposta da prefeitura excedeu o limite. É necessária conferência.",
            httpStatus,
            rawSoFar(),
          );
        }
        chunks.push(value);
        size += value.length;
      }
    }
    const raw = rawSoFar();
    return {
      transport: "ok",
      parsed: parseNfseResponse(raw),
      httpStatus,
      raw,
      durationMs: Date.now() - started,
      parserVersion: NFSE_PARSER_VERSION,
      responseComplete: true,
      transportError: null,
    };
  } catch (err) {
    const aborted =
      controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    return failure(
      aborted ? "timeout" : "rede",
      aborted ? "A prefeitura não respondeu a tempo." : "Falha de comunicação com a prefeitura.",
      httpStatus,
      rawSoFar(),
    );
  } finally {
    clearTimeout(timeout);
  }
}
