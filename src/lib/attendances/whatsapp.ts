export function normalizeWhatsAppNumber(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits || /^(\d)\1+$/.test(digits)) return null;

  const normalized =
    digits.length === 10 || digits.length === 11
      ? `55${digits}`
      : digits.length === 12 || digits.length === 13
        ? digits
        : "";
  if (!normalized.startsWith("55")) return null;

  const national = normalized.slice(2);
  if (national.length !== 10 && national.length !== 11) return null;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;

  const subscriber = national.slice(2);
  if (subscriber.length === 9 && subscriber[0] !== "9") return null;
  if (subscriber.length === 8 && !/[2-9]/.test(subscriber[0] ?? "")) return null;
  return normalized;
}

export function whatsappHref(value?: string | null): string | null {
  const number = normalizeWhatsAppNumber(value);
  return number ? `https://wa.me/${number}` : null;
}
