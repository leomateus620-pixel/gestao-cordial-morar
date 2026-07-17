export function brl(value: number, opts?: { compact?: boolean }) {
  if (opts?.compact && Math.abs(value) >= 1000) {
    if (Math.abs(value) >= 1_000_000)
      return "R$ " + (value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1) + "M";
    return "R$ " + Math.round(value / 1000) + "k";
  }
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Parse a currency string in pt-BR or common formats.
 * Accepts: "1.500,00", "1500,00", "1500.00", "1500", "R$ 1.500,50".
 * Returns NaN when the input is not a valid number.
 */
export function parseBRLNumber(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return NaN;
  if (typeof input === "number") return input;
  const raw = String(input).trim();
  if (!raw) return NaN;
  // strip currency symbol / spaces
  let s = raw.replace(/[R$\s\u00A0]/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // "1.500,00" -> "1500.00"
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "1500,00" -> "1500.00"
    s = s.replace(",", ".");
  }
  // Otherwise assume "." is decimal already, or plain integer.
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}