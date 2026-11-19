/** Server-only Sicredi configuration: fixed hosts per environment and per-brand credentials. */
import type { BillingAmbiente, BoletoBrand } from "../rules";

export const SICREDI_HOST = "https://api-parceiro.sicredi.com.br";
export function sicrediUrls(ambiente: BillingAmbiente) {
  const prefix = ambiente === "sandbox" ? "/sb" : "";
  return {
    token: `${SICREDI_HOST}${prefix}/auth/openapi/token`,
    cobranca: `${SICREDI_HOST}${prefix}/cobranca/boleto/v1`,
  };
}
/**
 * Public sandbox test data from the official Sicredi manual ("Dados de teste do Sandbox").
 * The sandbox never reads any brand credential.
 */
export const SICREDI_SANDBOX_TEST_ACCOUNT = {
  codigoBeneficiario: "12345",
  cooperativa: "6789",
  posto: "03",
  codigoAcesso: "teste123",
} as const;

export type SicrediCredentials = {
  brand: BoletoBrand;
  ambiente: BillingAmbiente;
  apiKey: string;
  codigoBeneficiario: string;
  cooperativa: string;
  posto: string;
  codigoAcesso: string;
};
export type CredentialsResult =
  | { ok: true; credentials: SicrediCredentials }
  | { ok: false; missing: string[]; invalid: string[] };

type Env = Record<string, string | undefined>;
const pad = (v: string, n: number) => (/^\d+$/.test(v) ? v.padStart(n, "0") : v);

/** Secret names (never values) that a brand × environment account needs. */
export function sicrediSecretNames(brand: BoletoBrand, ambiente: BillingAmbiente): string[] {
  if (ambiente === "sandbox") return ["SICREDI_SANDBOX_API_KEY"];
  const p = `SICREDI_${brand.toUpperCase()}_`;
  return ["API_KEY", "CODIGO_BENEFICIARIO", "COOPERATIVA", "POSTO", "CODIGO_ACESSO"].map(
    (s) => p + s,
  );
}

/** Reads credentials inside a handler. No fallback between brands or environments. */
export function readSicrediCredentials(
  brand: BoletoBrand,
  ambiente: BillingAmbiente,
  env: Env = process.env,
): CredentialsResult {
  const get = (name: string) => (env[name] ?? "").trim();
  if (ambiente === "sandbox") {
    const apiKey = get("SICREDI_SANDBOX_API_KEY");
    if (!apiKey) return { ok: false, missing: ["SICREDI_SANDBOX_API_KEY"], invalid: [] };
    return { ok: true, credentials: { brand, ambiente, apiKey, ...SICREDI_SANDBOX_TEST_ACCOUNT } };
  }
  const names = sicrediSecretNames(brand, ambiente);
  const missing = names.filter((n) => !get(n));
  if (missing.length) return { ok: false, missing, invalid: [] };
  const [apiKeyName, benName, coopName, postoName, accessName] = names;
  const codigoBeneficiario = pad(get(benName), 5);
  const cooperativa = pad(get(coopName), 4);
  const posto = pad(get(postoName), 2);
  const invalid: string[] = [];
  if (!/^\d{5}$/.test(codigoBeneficiario)) invalid.push(benName);
  if (!/^\d{4}$/.test(cooperativa)) invalid.push(coopName);
  if (!/^\d{2}$/.test(posto)) invalid.push(postoName);
  if (invalid.length) return { ok: false, missing: [], invalid };
  return {
    ok: true,
    credentials: {
      brand,
      ambiente,
      apiKey: get(apiKeyName),
      codigoBeneficiario,
      cooperativa,
      posto,
      codigoAcesso: get(accessName),
    },
  };
}

/** Display masks: public sandbox values; production codes are never echoed. */
export function accountMasks(ambiente: BillingAmbiente) {
  if (ambiente === "sandbox")
    return {
      beneficiario_mascara: SICREDI_SANDBOX_TEST_ACCOUNT.codigoBeneficiario,
      cooperativa_mascara: SICREDI_SANDBOX_TEST_ACCOUNT.cooperativa,
      posto_mascara: SICREDI_SANDBOX_TEST_ACCOUNT.posto,
    };
  return { beneficiario_mascara: "•••••", cooperativa_mascara: "••••", posto_mascara: "••" };
}
