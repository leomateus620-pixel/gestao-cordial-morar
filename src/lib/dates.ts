/**
 * Datas "só dia" (colunas `date`, AAAA-MM-DD) tratadas sem passar por UTC.
 * `new Date("AAAA-MM-DD")` vira 00:00 UTC = dia anterior em Brasília.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_SHORT = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** AAAA-MM-DD do instante informado no fuso America/Sao_Paulo. */
export function saoPauloKeyOf(value: Date): string {
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/** Data de hoje (AAAA-MM-DD) em America/Sao_Paulo. */
export function todaySaoPauloKey(now: Date = new Date()): string {
  return saoPauloKeyOf(now);
}

export function parseDateOnlyLocal(key: string): Date | null {
  const m = DATE_ONLY.exec((key ?? "").trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** AAAA-MM-DD fica como está; timestamp vira o dia em São Paulo. */
export function dateOnlyKey(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (DATE_ONLY.test(v)) return v;
  return saoPauloKeyOf(new Date(v));
}

/** "01 de out." (short) ou "01/10/2026" (full). */
export function formatDateOnlyBR(value: string | null | undefined, style: "short" | "full" = "short"): string {
  const key = dateOnlyKey(value);
  const m = DATE_ONLY.exec(key);
  if (!m) return "—";
  if (style === "full") return `${m[3]}/${m[2]}/${m[1]}`;
  return `${m[3]} de ${MONTHS_SHORT[Number(m[2]) - 1]}`;
}

/** Soma dias a uma chave AAAA-MM-DD (aritmética de calendário, sem fuso). */
export function addDaysToKey(key: string, days: number): string {
  const m = DATE_ONLY.exec(key);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}
