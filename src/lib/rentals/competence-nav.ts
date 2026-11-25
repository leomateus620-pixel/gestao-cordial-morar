import { currentRentalCompetence } from "./receipt-model";

export const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Valor da URL: só AAAA-MM válido; qualquer outra coisa vira ausente. */
export function parseCompetenciaParam(value: unknown): string | undefined {
  return typeof value === "string" && COMPETENCE_PATTERN.test(value) ? value : undefined;
}

export function effectiveCompetence(param: string | undefined, now = new Date()): string {
  return param ?? currentRentalCompetence(now);
}

export function shiftCompetence(value: string, delta: number): string {
  const [y, m] = value.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatCompetenceLong(value: string): string {
  const [y, m] = value.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1] ?? ""} de ${y}`;
}

export type RentalSearch = {
  id?: string;
  formulario?: string;
  etapa?: "vistorias";
  corretorId?: string;
  periodo?: string;
  imobiliaria?: string;
  status?: string;
  competencia?: string;
};

const KEPT = ["corretorId", "periodo", "imobiliaria", "status", "competencia"] as const;

/**
 * Único jeito de navegar na tela de Aluguéis: competência e filtros são sempre mantidos;
 * id, formulario e etapa só existem se vierem no patch. Competência igual ao mês atual
 * não é gravada na URL.
 */
export function rentalSearch<T extends RentalSearch>(
  prev: T,
  patch: Partial<T>,
  now = new Date(),
): T {
  const next = {} as T;
  for (const key of KEPT) {
    const value = key in patch ? patch[key] : prev[key];
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  for (const key of ["id", "formulario", "etapa"] as const) {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
  }
  if (next.competencia === currentRentalCompetence(now)) delete next.competencia;
  return next;
}

const STORAGE_KEY = "alugueis:competencia";

export function rememberCompetence(value: string) {
  try {
    if (typeof sessionStorage !== "undefined" && COMPETENCE_PATTERN.test(value))
      sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* armazenamento indisponível: a URL continua valendo */
  }
}

export function readRememberedCompetence(): string | undefined {
  try {
    if (typeof sessionStorage === "undefined") return undefined;
    return parseCompetenciaParam(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return undefined;
  }
}
