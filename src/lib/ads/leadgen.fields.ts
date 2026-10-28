import { phoneDigits } from "../attendances/duplicate-detection";

export type MetaFieldData = { name: string; values: string[] }[];
export type MetaFieldMapping = Partial<
  Record<"full_name" | "phone" | "email" | "interest", string>
>;
export function normalizeMetaPhone(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = phoneDigits(value);
  if (
    digits.length < 8 ||
    digits.length > 15 ||
    (!value.trim().startsWith("+") && digits.length < 10)
  )
    return null;
  return value.trim().startsWith("+") ? `+${digits}` : digits;
}
export function mapMetaLeadFields(fieldData: unknown, mapping: MetaFieldMapping = {}) {
  if (!Array.isArray(fieldData) || fieldData.length > 100) throw new Error("invalid_lead_fields");
  const fields: MetaFieldData = fieldData.map((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.name !== "string" ||
      !Array.isArray(value.values) ||
      value.values.some((item: unknown) => typeof item !== "string")
    )
      throw new Error("invalid_lead_fields");
    return {
      name: value.name.slice(0, 200),
      values: value.values.slice(0, 20).map((item: string) => item.slice(0, 2000)),
    };
  });
  const get = (...keys: string[]) =>
    fields.find((field) => keys.includes(field.name))?.values[0]?.trim() ?? "";
  const email = get(mapping.email ?? "email").toLowerCase();
  return {
    full_name:
      (
        get(mapping.full_name ?? "full_name") ||
        [get("first_name"), get("last_name")].filter(Boolean).join(" ")
      ).slice(0, 300) || null,
    phone: normalizeMetaPhone(
      get(mapping.phone ?? "phone_number", ...(mapping.phone ? [] : ["phone"])),
    ),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 320) : null,
    interest: get(mapping.interest ?? "interest").slice(0, 2000) || null,
    field_data: fields,
  };
}
export function leadRetryPolicy(code: string, attempts: number, random = Math.random()) {
  const terminal =
    [
      "not_configured",
      "not_connected",
      "token_expired",
      "no_permission",
      "campaign_not_found",
      "invalid_fields",
      "invalid_parameter",
      "conflict",
    ].includes(code) || attempts >= 8;
  return {
    terminal,
    delaySeconds: Math.round(
      Math.min(21_600, 30 * 2 ** Math.max(0, attempts - 1)) *
        (0.75 + Math.max(0, Math.min(1, random)) * 0.5),
    ),
  };
}
