import { formatBrlInput, parseBrlInput } from "@/lib/format";

/** Same money value, treating "no value" (NaN) as equal to itself. */
export function sameMoneyValue(a: number, b: number): boolean {
  return Number.isNaN(a) ? Number.isNaN(b) : a === b;
}

/**
 * Text a money field should show after its value changed from outside.
 * Keeps what the person typed when it already means that value (typing "1.2"
 * or clearing the field never jumps); otherwise shows the new value formatted.
 */
export function syncMoneyText(text: string, value: number): string {
  return sameMoneyValue(parseBrlInput(text), value) ? text : formatBrlInput(value);
}
