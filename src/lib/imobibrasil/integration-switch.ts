/**
 * Interruptor autoritativo da integração ImobiBrasil.
 * Estado fixo OFF no código: nenhuma configuração, credencial ou tela pode
 * religar. Religar exige alterar este arquivo de propósito.
 */
export const IMOBI_INTEGRATION_STATE = "off" as const;

export function imobiIntegrationEnabled(): boolean {
  return (IMOBI_INTEGRATION_STATE as string) === "on";
}

/** Resposta padrão das rotinas automáticas quando a ImobiBrasil está desligada. */
export function imobiDisabledResponse(job: string): Response {
  return Response.json({ ok: true, disabled: true, reason: "imobi_off", job, claimed: 0 });
}
