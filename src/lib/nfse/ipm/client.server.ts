import { parseNfseResponse, type NfseParsedResponse } from "./xml";

export type PostNfseInput = {
  endpointUrl: string;
  login: string;
  senha: string;
  cidade: string;
  xml: string;
};

export type PostNfseResult = NfseParsedResponse & {
  httpStatus: number;
  raw: string;
};

/** Monta o cabeçalho HTTP Basic exigido pela IPM (NT 35/2021 v2.9). */
export function buildBasicAuthHeader(login: string, senha: string): string {
  const user = String(login ?? "").replace(/\D+/g, "") || String(login ?? "").trim();
  return `Basic ${Buffer.from(`${user}:${senha}`, "utf-8").toString("base64")}`;
}

/**
 * Envio síncrono ao WNERestServiceNFSe (Atende.Net / Santa Rosa).
 * Autenticação via HTTP Basic (CNPJ só dígitos + senha de acesso ao sistema,
 * com o serviço "Emissão de NFS-e por WebService" liberado no Portal do
 * Cidadão). O corpo multipart leva apenas a cidade (TOM) e o arquivo XML —
 * sem certificado digital e sem login/senha no corpo.
 */
export async function postNfse(input: PostNfseInput): Promise<PostNfseResult> {
  const form = new FormData();
  form.append("cidade", input.cidade);
  form.append(
    "f1",
    new Blob([input.xml], { type: "text/xml; charset=utf-8" }),
    "nfse.xml",
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(input.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: buildBasicAuthHeader(input.login, input.senha),
      },
      body: form,
      signal: controller.signal,
    });
    const raw = await response.text();
    const parsed = parseNfseResponse(raw);
    return {
      ...parsed,
      ok: parsed.ok && response.ok,
      httpStatus: response.status,
      raw,
    };
  } finally {
    clearTimeout(timeout);
  }
}
