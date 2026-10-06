import { IMOBI_NUMERO_MAX, addressNumberLength } from "@/lib/imoveis/address-rules";

export const NUMERO_FIX_PATH = "Abra Editar imóvel → Endereço → Número e mova bloco/apartamento para Complemento.";

export function numeroPrecheckMessage(length: number): string {
  return `Número do endereço com ${length} caracteres (máximo ${IMOBI_NUMERO_MAX} nos sites). ${NUMERO_FIX_PATH}`;
}

/**
 * Pré-checagem local do corpo a enviar. Devolve a mensagem de bloqueio ou
 * `null`. Não lê nem altera estado: é chamada antes de qualquer trava/HTTP.
 */
export function precheckAddressPayload(payload: Record<string, unknown>): string | null {
  const value = payload["numero"];
  if (typeof value !== "string") return null;
  const length = addressNumberLength(value);
  return length > IMOBI_NUMERO_MAX ? numeroPrecheckMessage(length) : null;
}
