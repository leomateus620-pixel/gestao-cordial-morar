/** Preenchimento inicial da revisão de NFS-e a partir do aluguel. Puro e testável. */

/** Mês anterior ao atual no horário de Brasília, formato YYYY-MM. */
export function previousCompetence(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  let y = Number(parts.find((p) => p.type === "year")?.value);
  let m = Number(parts.find((p) => p.type === "month")?.value) - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Último dia da competência YYYY-MM, formato YYYY-MM-DD. */
export function lastDayOfCompetence(competencia: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!match) return "";
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
}

export type ParsedAddress = { logradouro: string; numero: string; bairro: string; cep: string };

/** Interpreta endereço em texto livre ("Rua X, n° 99 – Bairro Y-Cidade/UF"). Melhor esforço. */
export function parseFreeAddress(text?: string | null): ParsedAddress {
  const out: ParsedAddress = { logradouro: "", numero: "", bairro: "", cep: "" };
  if (!text) return out;
  const cep = /(\d{5})-?(\d{3})/.exec(text);
  if (cep) out.cep = `${cep[1]}${cep[2]}`;
  const clean = text.replace(/CEP[:\s]*\d{5}-?\d{3}/i, "").replace(/\d{5}-\d{3}/, "");
  const pieces = clean.split(/\s[–—-]\s|,/).map((s) => s.trim()).filter(Boolean);
  if (pieces[0]) out.logradouro = pieces[0];
  for (const piece of pieces.slice(1)) {
    const num = /^(?:n[º°o.]*\s*)?(\d+[A-Za-z]?|s\/?n)\b/i.exec(piece);
    if (!out.numero && num) {
      out.numero = num[1]!;
      continue;
    }
    if (!out.bairro) {
      out.bairro = piece
        .replace(/^bairro\s+/i, "")
        .replace(/\s*[-–]\s*[^-–]*\/[A-Z]{2}\s*$/i, "")
        .trim();
    }
  }
  return out;
}

export function formatCompetence(competencia: string): string {
  const [y, m] = competencia.split("-");
  return y && m ? `${m}/${y}` : competencia;
}

export type PrefillSource = {
  competencia: string;
  comissaoMensal?: number | null;
  tenantNome?: string | null;
  tenantDocumento?: string | null;
  tenantEndereco?: string | null;
  propertyLabel?: string | null;
};

export function buildRentalPrefill(src: PrefillSource) {
  const addr = parseFreeAddress(src.tenantEndereco);
  return {
    valor:
      src.comissaoMensal != null && src.comissaoMensal > 0
        ? src.comissaoMensal.toFixed(2).replace(".", ",")
        : "",
    dataFatoGerador: lastDayOfCompetence(src.competencia),
    nome: src.tenantNome?.trim() ?? "",
    documento: (src.tenantDocumento ?? "").replace(/\D/g, ""),
    logradouro: addr.logradouro,
    numero: addr.numero,
    bairro: addr.bairro,
    cep: addr.cep,
    motivo: `Comissão de administração do aluguel — competência ${formatCompetence(src.competencia)}${
      src.propertyLabel ? ` — contrato ${src.propertyLabel}` : ""
    }`,
  };
}

/** Aplica o preenchimento só nos campos vazios. */
export function fillEmpty<T extends Record<string, string>>(current: T, fill: Partial<T>): T {
  const next = { ...current };
  for (const [k, v] of Object.entries(fill) as [keyof T, string][]) {
    if (!next[k] && v) next[k] = v as T[keyof T];
  }
  return next;
}
