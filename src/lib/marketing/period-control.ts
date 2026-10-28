import type { DateRange } from "@/services/marketing-insights";

const monthName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" });
/** Calendar dates are formatted without conversion through the browser timezone. */
export function compactMarketingRange(range: DateRange, includeYear = true) {
  const [fromYear, fromMonth, fromDay] = range.since.split("-");
  const [toYear, toMonth, toDay] = range.until.split("-");
  const suffix = includeYear || fromYear !== toYear ? ` ${toYear}` : "";
  if (range.since === range.until) return `${fromDay} ${monthName(range.since)}${suffix}`;
  if (fromYear === toYear && fromMonth === toMonth)
    return `${fromDay}–${toDay} ${monthName(range.until)}${suffix}`;
  return `${fromDay} ${monthName(range.since)}${fromYear !== toYear ? ` ${fromYear}` : ""} – ${toDay} ${monthName(range.until)}${suffix}`;
}
export function validateMarketingPeriod(since: string, until: string) {
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(since) || !validDate(until)) return "Selecione a data inicial e a data final.";
  const days = (Date.parse(`${until}T12:00:00Z`) - Date.parse(`${since}T12:00:00Z`)) / 86400000 + 1;
  if (days < 1) return "A data final deve ser igual ou posterior à inicial.";
  if (days > 367) return "Selecione um intervalo de até 367 dias.";
  return null;
}
