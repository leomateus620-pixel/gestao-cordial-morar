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

/**
 * Envio síncrono ao WNERestServiceNFSe (Atende.Net / Santa Rosa).
 * multipart/form-data com login (CNPJ), senha do webservice, cidade (TOM)
 * e o arquivo XML — sem certificado digital.
 */
export async function postNfse(input: PostNfseInput): Promise<PostNfseResult> {
  const form = new FormData();
  form.append("login", input.login);
  form.append("senha", input.senha);
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
