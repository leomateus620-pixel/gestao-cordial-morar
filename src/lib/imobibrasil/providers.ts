/**
 * Allowlist server-side dos provedores ImobiBrasil.
 * Nenhuma base URL vinda do navegador é aceita em qualquer ponto do sistema.
 */

export const IMOBI_PROVIDERS = {
  cordial: {
    key: "cordial",
    label: "Cordial Imóveis",
    baseUrl: "https://www.cordialimoveis.com/api/v1/app",
    tokenSecret: "IMOBIBRASIL_CORDIAL_TOKEN",
  },
  morar: {
    key: "morar",
    label: "Morar Imóveis",
    baseUrl: "https://www.imobiliariamorarimoveis.com.br/api/v1/app",
    tokenSecret: "IMOBIBRASIL_MORAR_TOKEN",
  },
} as const;

export type ImobiProvider = keyof typeof IMOBI_PROVIDERS;

export const IMOBI_PROVIDER_KEYS: ImobiProvider[] = ["cordial", "morar"];

export function isImobiProvider(value: unknown): value is ImobiProvider {
  return typeof value === "string" && (value === "cordial" || value === "morar");
}

export function providerConfig(provider: ImobiProvider) {
  const config = IMOBI_PROVIDERS[provider];
  if (!config) throw new Error(`Provedor desconhecido: ${String(provider)}`);
  return config;
}

export function providerLabel(provider: ImobiProvider): string {
  return IMOBI_PROVIDERS[provider]?.label ?? provider;
}
