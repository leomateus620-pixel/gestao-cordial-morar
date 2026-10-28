/** A second full response alone is insufficient: exact-day emptiness and matching totals are required. */
export function revisionEvidenceEnough(input: {
  firstSeen: string;
  now: number;
  missingDays: string[];
  verifiedEmptyDays: string[];
  dailyImpressions: number;
  periodImpressions: number | null;
  dailySpend: number;
  periodSpend: number | null;
}) {
  return (
    Number.isFinite(Date.parse(input.firstSeen)) &&
    input.now - Date.parse(input.firstSeen) >= 10 * 60000 &&
    input.missingDays.length > 0 &&
    input.missingDays.length <= 5 &&
    input.missingDays.every((d) => input.verifiedEmptyDays.includes(d)) &&
    input.periodImpressions !== null &&
    input.periodSpend !== null &&
    input.dailyImpressions === input.periodImpressions &&
    // Graph decimal spend fields may have more precision than a currency's display units.
    Math.abs(input.dailySpend - input.periodSpend) < 0.000001
  );
}

/** Fingerprint the disappearance, not changing totals on unrelated active days. */
export function missingDayEvidenceIdentity(
  stored: { data: string; spend: number | null; impressions: number | null }[],
  missing: string[],
) {
  const set = new Set(missing);
  return JSON.stringify(
    stored
      .filter((day) => set.has(day.data))
      .map((day) => ({ date: day.data, spend: day.spend, impressions: day.impressions }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
}
