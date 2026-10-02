/** Regras puras da emissão (estado, identificador, competência, trava de teste). */
import type { NfseParsedResponse } from "./ipm/response";

export type EmissionStatus = "teste_ok" | "emitida" | "erro" | "cancelada" | "processando" | "incerto" | "nao_emitida";

export const PROCESSANDO_STALE_MS = 120_000;
export const NFSE_TIMEOUT_MS = 45_000;

/** GC-<brand>-<contractId sem hífens>-<AAAAMM>-1[-T] (≤ 80 caracteres). */
export function buildIdentificador(brand: string, contractId: string, competencia: string, teste: boolean): string {
  const ym = competencia.replace(/\D/g, "").slice(0, 6);
  const id = `GC-${brand}-${contractId.replace(/-/g, "")}-${ym}-1${teste ? "-T" : ""}`;
  return id.slice(0, 80);
}

/** Competência padrão a partir do vencimento lido como texto (sem new Date). */
export function competenciaFromVencimento(vencimento: string | null | undefined, hojeYm: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(vencimento ?? ""));
  return m ? `${m[1]}-${m[2]}` : hojeYm;
}

export function currentYmSaoPaulo(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${mo}`;
}

function ymIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return (y as number) * 12 + ((m as number) - 1);
}

/** Recusa competências mais de 1 mês no futuro. */
export function assertCompetenciaPermitida(competencia: string, hojeYm: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error("Competência inválida: use AAAA-MM.");
  if (ymIndex(competencia) - ymIndex(hojeYm) > 1)
    throw new Error("Competência mais de 1 mês no futuro não pode ser emitida.");
}

export const MODO_TESTE_LIGADO_MSG =
  "Modo teste ligado nas Integrações: desligue lá para emitir nota real";

/** A configuração manda: modo teste ligado força teste e recusa pedido real. */
export function resolveModoTeste(input: {
  configModoTeste: boolean;
  pedidoModoTeste?: boolean;
  confirmarEmissaoReal?: boolean;
}): boolean {
  const querReal = input.pedidoModoTeste === false;
  if (input.configModoTeste) {
    if (querReal) throw new Error(MODO_TESTE_LIGADO_MSG);
    return true;
  }
  if (!querReal) return true;
  if (input.confirmarEmissaoReal !== true)
    throw new Error("Emissão real exige confirmação explícita.");
  return false;
}

/** Status final de uma tentativa a partir do retorno da prefeitura. */
export function classifyResult(
  parsed: NfseParsedResponse,
  httpStatus: number,
  modoTeste: boolean,
): EmissionStatus {
  if (httpStatus >= 500) return "incerto";
  if (parsed.kind === "recusa") return "erro";
  if (parsed.kind === "ilegivel") return "incerto";
  if (modoTeste) return parsed.kind === "teste_ok" ? "teste_ok" : "incerto";
  if (parsed.kind !== "sucesso") return "incerto";
  if (parsed.numeroNfse && (!parsed.situacaoCodigo || parsed.situacaoCodigo === "1")) return "emitida";
  return "incerto";
}

export const RECONCILE_SUGGEST_AFTER = 3;

/** Depois de 3 conferências seguidas em incerto, sugerir a marcação manual. */
export function shouldSuggestManualResolution(status: EmissionStatus, attempts: number): boolean {
  return status === "incerto" && attempts - 1 >= RECONCILE_SUGGEST_AFTER;
}

/** Regra de "Marcar como não emitida". Retorna a recusa ou null se permitido. */
export function checkMarkNotIssued(input: {
  isAdmin: boolean;
  status: string;
  numeroNfse: string | null;
  reason: string;
  conferidoNoPortal: boolean;
}): string | null {
  if (!input.isAdmin) return "Apenas a administração pode marcar uma nota como não emitida.";
  if (input.conferidoNoPortal !== true) return "Confirme que conferiu no portal da prefeitura.";
  if (String(input.reason ?? "").trim().length < 10) return "Informe o motivo (mínimo de 10 caracteres).";
  if (input.status !== "incerto") return "Só emissões aguardando conferência podem ser marcadas como não emitidas.";
  if (input.numeroNfse) return "Esta emissão tem número de nota: não pode ser marcada como não emitida.";
  return null;
}

/** Reclassificação de linha presa a partir do retorno gravado. null = fica como está. */
export function reclassifyFromRaw(
  status: string,
  raw: string | null,
  modoTeste: boolean,
  parse: (raw: string) => NfseParsedResponse,
): EmissionStatus | null {
  if (status !== "incerto" && status !== "processando") return null;
  if (!raw || !raw.trim()) return null;
  const parsed = parse(raw);
  const next = classifyResult(parsed, 200, modoTeste);
  if (next === "erro" || next === "emitida" || next === "teste_ok") return next;
  return null;
}
