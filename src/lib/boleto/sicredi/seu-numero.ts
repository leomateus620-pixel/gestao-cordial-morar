/**
 * Deterministic `seuNumero` (10 base36 characters) for one occurrence of a contract
 * competence: base36 of the first 51 bits of SHA-256("<contract>:<AAAA-MM>:<ocorrencia>").
 * Mirrored in SQL by public.rental_boleto_seu_numero (keep both identical).
 */
export async function boletoSeuNumero(
  contractId: string,
  competencia: string,
  ocorrencia: number,
): Promise<string> {
  const bytes = new TextEncoder().encode(`${contractId.toLowerCase()}:${competencia}:${ocorrencia}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(hash.slice(0, 7), (b) => b.toString(16).padStart(2, "0")).join("");
  const value = BigInt(`0x${hex.slice(0, 13)}`) >> 1n;
  return value.toString(36).toUpperCase().padStart(10, "0");
}

/** idTituloEmpresa (≤ 25): seuNumero + AAAAMM, alphanumeric only. */
export function boletoIdTituloEmpresa(seuNumero: string, competencia: string): string {
  return `${seuNumero}${competencia.replace("-", "")}`;
}
