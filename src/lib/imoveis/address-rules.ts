/**
 * Regras do número do endereço. Puro (sem servidor): usado pelo formulário,
 * pelo servidor e pela pré-checagem do envio aos sites.
 */
export const IMOBI_NUMERO_MAX = 15;

export const NUMERO_HINT =
  "Só o número do prédio/casa (ex.: 355 ou S/N). Bloco, apartamento e fundos vão em Complemento.";

export function addressNumberLength(numero: string | null | undefined): number {
  return (numero ?? "").trim().length;
}

export function addressNumberError(length: number): string {
  return `Número do endereço com ${length} caracteres (máximo ${IMOBI_NUMERO_MAX} nos sites). Bloco, apartamento e fundos vão em Complemento.`;
}

export type AddressNumberCheck = { ok: true } | { ok: false; length: number; message: string };

export function validateAddressNumber(numero: string | null | undefined): AddressNumberCheck {
  const length = addressNumberLength(numero);
  if (length <= IMOBI_NUMERO_MAX) return { ok: true };
  return { ok: false, length, message: addressNumberError(length) };
}

const COMPLEMENT_WORDS = /\b(bl|bloco|ap|apt|apto|apartamento|fundos|lote|lt|casa|sala|loja|quadra|qd|torre|andar|box)\b/i;

/** Indica texto de complemento no Número (oferece sugestão, não bloqueia). */
export function looksLikeComplement(numero: string | null | undefined): boolean {
  const value = (numero ?? "").trim();
  if (!value) return false;
  const split = suggestAddressSplit(value);
  return split !== null && split.complemento.length > 0 && (COMPLEMENT_WORDS.test(value) || /[\s,/\-:]/.test(value));
}

/**
 * Separa o número do prédio/casa do resto. Nunca trunca; devolve `null`
 * quando não há número reconhecível ou nada para mover.
 */
export function suggestAddressSplit(
  numero: string | null | undefined,
): { numero: string; complemento: string } | null {
  const value = (numero ?? "").trim();
  if (!value) return null;
  const match = value.match(/^(s\s*\/\s*n|sn|sem(?:\s+n[uú]mero)?|\d+[a-z]?)(?![0-9a-z])(.*)$/i);
  if (!match) return null;
  const head = match[1]!;
  const rest = match[2]!
    .replace(/^[\s,;/\-:.]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest) return null;
  const normalizedHead = /^\d/.test(head) ? head.toUpperCase() : /^s\s*\/\s*n$|^sn$/i.test(head) ? "S/N" : head;
  return { numero: normalizedHead, complemento: rest };
}

/** Junta o complemento sugerido ao existente, sem repetir texto igual. */
export function mergeComplemento(sugerido: string, existente: string | null | undefined): string {
  const current = (existente ?? "").trim();
  if (!current) return sugerido;
  if (current.toLowerCase().includes(sugerido.toLowerCase())) return current;
  return `${sugerido}, ${current}`;
}
