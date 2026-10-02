import { NFSE_TIMEOUT_MS } from "../emission-rules";
import { decodeResponse, parseNfseResponse, type NfseParsedResponse } from "./response";

export type PostNfseInput = {
  endpointUrl: string;
  login: string;
  senha: string;
  cidade: string;
  xml: string;
  timeoutMs?: number;
};

export type PostNfseResult = {
  transport: "ok" | "timeout" | "rede";
  parsed: NfseParsedResponse;
  httpStatus: number | null;
  raw: string;
  durationMs: number;
  /** Mensagem de falha de transporte (nunca contém credenciais). */
  transportError: string | null;
};

/** Monta o cabeçalho HTTP Basic exigido pela IPM (NT 35/2021 v2.9). */
export function buildBasicAuthHeader(login: string, senha: string): string {
  const user = String(login ?? "").replace(/\D+/g, "") || String(login ?? "").trim();
  return `Basic ${Buffer.from(`${user}:${senha}`, "utf-8").toString("base64")}`;
}

/**
 * Envio síncrono ao WNERestServiceNFSe. Nunca lança: falhas de transporte
 * voltam como transport="timeout"/"rede" para serem gravadas como "incerto".
 */
export async function postNfse(input: PostNfseInput): Promise<PostNfseResult> {
  const form = new FormData();
  form.append("cidade", input.cidade);
  form.append("f1", new Blob([input.xml], { type: "text/xml; charset=utf-8" }), "nfse.xml");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? NFSE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(input.endpointUrl, {
      method: "POST",
      headers: { Authorization: buildBasicAuthHeader(input.login, input.senha) },
      body: form,
      signal: controller.signal,
    });
    const raw = decodeResponse(await response.arrayBuffer(), response.headers.get("content-type"));
    return {
      transport: "ok",
      parsed: parseNfseResponse(raw),
      httpStatus: response.status,
      raw,
      durationMs: Date.now() - started,
      transportError: null,
    };
  } catch (err) {
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    return {
      transport: aborted ? "timeout" : "rede",
      parsed: parseNfseResponse(""),
      httpStatus: null,
      raw: "",
      durationMs: Date.now() - started,
      transportError: aborted
        ? "A prefeitura não respondeu a tempo."
        : "Falha de comunicação com a prefeitura.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
