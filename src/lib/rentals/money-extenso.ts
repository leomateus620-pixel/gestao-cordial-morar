/** Valor em reais por extenso (pt-BR), ex.: 1700 -> "mil e setecentos reais". */
const U = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const D = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const C = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function below1000(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (c) parts.push(C[c] ?? "");
  if (r)
    parts.push(
      r < 20
        ? (U[r] ?? "")
        : [D[Math.floor(r / 10)], r % 10 ? U[r % 10] : ""].filter(Boolean).join(" e "),
    );
  return parts.join(" e ");
}

function integerWords(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "um milhão" : `${below1000(millions)} milhões`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${below1000(thousands)} mil`);
  if (rest) parts.push(below1000(rest));
  if (parts.length === 1) return parts[0] ?? "";
  const last = parts.pop() ?? "";
  const glue = rest && (rest < 100 || rest % 100 === 0) ? " e " : " ";
  return `${parts.join(" ")}${glue}${last}`;
}

export function reaisPorExtenso(value: number): string {
  const cents = Math.round(value * 100);
  const int = Math.floor(cents / 100);
  const c = cents % 100;
  const reais = int
    ? `${integerWords(int)}${int % 1_000_000 === 0 ? " de" : ""} ${int === 1 ? "real" : "reais"}`
    : "";
  const cent = c ? `${integerWords(c)} ${c === 1 ? "centavo" : "centavos"}` : "";
  return [reais, cent].filter(Boolean).join(" e ") || "zero reais";
}

export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "R$ 1.700,00 (mil e setecentos reais)" */
export function moneyWithWords(value: number): string {
  return `${formatBRL(value)} (${reaisPorExtenso(value)})`;
}
