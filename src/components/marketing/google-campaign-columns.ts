import { metrics, type Metric } from "./google-metrics";

export type CampaignColumn = Metric | "status" | "type";
export const defaultColumns: CampaignColumn[] = [
  "status",
  "type",
  "cost",
  "impressions",
  "clicks",
  "conversions",
  "costPerConversion",
  "ctr",
  "cpc",
];
export const compactColumns: CampaignColumn[] = ["status", "cost", "clicks", "conversions"];
export const campaignColumns: Array<{ key: CampaignColumn; label: string }> = [
  { key: "status", label: "Status" },
  { key: "type", label: "Tipo" },
  ...[metrics[0], metrics[4], metrics[1], metrics[2], metrics[3], metrics[5], metrics[6]],
];
export function googleColumnPreferenceKey(userId: string, agency: string) {
  return `marketing:google:columns:${encodeURIComponent(userId)}:${agency}`;
}
export function googleColumnsFromPreference(value: unknown): CampaignColumn[] {
  const allowed = new Set(campaignColumns.map((column) => column.key));
  return Array.isArray(value) &&
    value.every((key) => typeof key === "string" && allowed.has(key as CampaignColumn))
    ? [...new Set(value as CampaignColumn[])]
    : [...defaultColumns];
}
export function toggleGoogleColumn(
  current: CampaignColumn[],
  key: CampaignColumn,
  checked: boolean,
): CampaignColumn[] {
  return checked ? [...new Set([...current, key])] : current.filter((column) => column !== key);
}
