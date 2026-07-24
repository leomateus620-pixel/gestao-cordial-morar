import type { RentalProperty } from "../../types/rental.ts";

export function formatRentalDate(value?: string | null): string {
  if (!value) return "—";

  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "—";

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export function hasRentalOwnerData(property: RentalProperty): boolean {
  return Boolean(
    property.proprietarioNome?.trim() ||
    property.proprietarioCpf?.trim() ||
    property.proprietarioTelefone?.trim() ||
    property.proprietarioEmail?.trim(),
  );
}
