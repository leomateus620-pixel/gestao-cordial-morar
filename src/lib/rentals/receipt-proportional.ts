/** Proportional rent for a partial month (move-in or move-out). Pure and browser-safe. */
export type ProportionalKind = "entrada" | "saida";
export type ProportionalResult =
  | { ok: true; dias: number; diasMes: number; valor: number; descricao: string }
  | { ok: false; error: string };

export function daysInCompetence(competencia: string) {
  const [y, m] = competencia.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthNamePt(competencia: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
    .format(new Date(`${competencia}-01T12:00:00Z`))
    .toLowerCase();
}

export function proportionalDescription(dias: number, competencia: string) {
  const mes = monthNamePt(competencia);
  return dias === 1
    ? `referente a 1 dia morado em ${mes}`
    : `referente aos ${dias} dias morados em ${mes}`;
}

/** Days lived (inclusive) for a date inside the competence, or null if outside. */
export function daysFromDate(kind: ProportionalKind, date: string, competencia: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== competencia) return null;
  const d = Number(date.slice(8, 10));
  const total = daysInCompetence(competencia);
  if (d < 1 || d > total) return null;
  return kind === "entrada" ? total - d + 1 : d;
}

export function computeProportionalRent(args: {
  valorMensal: number;
  competencia: string;
  kind: ProportionalKind;
  date?: string;
  dias?: number;
}): ProportionalResult {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.competencia))
    return { ok: false, error: "Competência inválida." };
  const diasMes = daysInCompetence(args.competencia);
  let dias = args.dias;
  if (dias === undefined) {
    if (!args.date) return { ok: false, error: "Informe a data ou os dias morados." };
    const d = daysFromDate(args.kind, args.date, args.competencia);
    if (d === null) return { ok: false, error: "A data precisa estar dentro do mês do recibo." };
    dias = d;
  }
  if (!Number.isInteger(dias) || dias < 1 || dias > diasMes)
    return { ok: false, error: `Os dias morados devem ficar entre 1 e ${diasMes}.` };
  if (!Number.isFinite(args.valorMensal) || args.valorMensal < 0)
    return { ok: false, error: "Valor do aluguel inválido." };
  const cents = Math.round(args.valorMensal * 100);
  const valor = Math.floor((cents * dias) / diasMes + 0.5) / 100;
  return {
    ok: true,
    dias,
    diasMes,
    valor,
    descricao: proportionalDescription(dias, args.competencia),
  };
}
