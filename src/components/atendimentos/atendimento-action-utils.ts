/** Builds an ISO instant from local date/time fields without a UTC-midnight shift. */
export function buildLocalIso(dateStr: string, timeStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = (timeStr || "09:00").split(":").map(Number);
  if (!year || !month || !day) return undefined;
  const local = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
  return Number.isNaN(local.getTime()) ? undefined : local.toISOString();
}
