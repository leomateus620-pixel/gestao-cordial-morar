/**
 * Interruptor autoritativo da integração ImobiBrasil.
 * Estado fixo OFF no código: nenhuma configuração, credencial ou tela pode
 * religar. Religar exige alterar este arquivo de propósito.
 */
export const IMOBI_INTEGRATION_STATE = "off" as const;

export function imobiIntegrationEnabled(): boolean {
  return (IMOBI_INTEGRATION_STATE as string) === "on";
}
