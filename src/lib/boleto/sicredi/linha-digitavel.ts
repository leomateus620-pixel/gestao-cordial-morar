/** Pure FEBRABAN helpers for the 47-digit linha digitável and the 44-digit barcode. */
const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Módulo 10 (weights 2,1 from the right; products summed digit by digit). */
export function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const p = Number(digits[i]) * weight;
    sum += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

/** Módulo 11 of the barcode general check digit (weights 2..9; 0, 10 and 11 become 1). */
export function mod11Barcode(digits43: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits43.length - 1; i >= 0; i--) {
    sum += Number(digits43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

/** Converts a linha digitável into its barcode (throws on wrong length). */
export function linhaToBarcode(linha: string): string {
  const d = onlyDigits(linha);
  if (d.length !== 47) throw new Error("Linha digitável deve ter 47 dígitos.");
  const free = d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + free;
}

/** True only when every field check digit and the general check digit match. */
export function isValidLinhaDigitavel(linha: string): boolean {
  const d = onlyDigits(linha);
  if (d.length !== 47 || d !== linha.replace(/[\s.]/g, "")) return false;
  if (mod10(d.slice(0, 9)) !== Number(d[9])) return false;
  if (mod10(d.slice(10, 20)) !== Number(d[20])) return false;
  if (mod10(d.slice(21, 31)) !== Number(d[31])) return false;
  const bar = linhaToBarcode(d);
  return mod11Barcode(bar.slice(0, 4) + bar.slice(5)) === Number(bar[4]);
}

/** True when a 44-digit barcode carries a valid general check digit. */
export function isValidBarcode(barcode: string): boolean {
  if (!/^\d{44}$/.test(barcode)) return false;
  return mod11Barcode(barcode.slice(0, 4) + barcode.slice(5)) === Number(barcode[4]);
}

/** 00000.00000 00000.000000 00000.000000 0 00000000000000 */
export function formatLinhaDigitavel(linha: string): string {
  const d = onlyDigits(linha);
  if (d.length !== 47) return linha;
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
}
