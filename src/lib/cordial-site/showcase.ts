/**
 * Vitrine semanal do site Cordial — regras puras (sem rede), usadas pelo worker e pelo painel.
 * Horário de São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
 */
export const SP_OFFSET_HOURS = -3;
export const SHOWCASE_PROMPT_VERSION = "vitrine-natural-v1";
export const SHOWCASE_MODEL = "openai/gpt-image-2.5-sunburst";
export const SHOWCASE_SIZE = { width: 1536, height: 1024, size: "1536x1024" } as const;
export const SHOWCASE_REPEAT_WEEKS = 4;
export const SHOWCASE_PROMPT =
  "Edição fotográfica imobiliária fiel. Melhore apenas luz, exposição, contraste, balanço de branco, nitidez e alinhamento de horizonte/verticais. " +
  "Não adicione, remova, mova ou substitua nenhum objeto, móvel, planta, pessoa, céu, janela, parede, piso ou elemento arquitetônico. " +
  "Não altere cores reais de materiais nem dimensões dos ambientes. Mantenha o enquadramento original. Resultado natural, sem aparência de render.";

export type ShowcaseState =
  | "agendado" | "gerando" | "aguardando_revisao" | "pronto" | "ativo"
  | "encerrado" | "falhou" | "incerto" | "recusado" | "substituido";

export const STATE_LABEL: Record<ShowcaseState, string> = {
  agendado: "Agendada",
  gerando: "Gerando edição",
  aguardando_revisao: "Aguardando sua aprovação",
  pronto: "Aprovada, entra na segunda",
  ativo: "No ar",
  encerrado: "Encerrada",
  falhou: "Falhou",
  incerto: "Resultado incerto (não reenviado)",
  recusado: "Recusada",
  substituido: "Substituída",
};

export interface ShowcaseSchedule {
  prepareDow: number; // 0 = domingo
  prepareHour: number;
  activateHour: number;
}
export const DEFAULT_SCHEDULE: ShowcaseSchedule = { prepareDow: 0, prepareHour: 18, activateHour: 6 };

const DAY = 86_400_000;
const spMs = (utc: Date) => utc.getTime() + SP_OFFSET_HOURS * 3_600_000;
const fromSp = (ms: number) => new Date(ms - SP_OFFSET_HOURS * 3_600_000);
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Segunda-feira (data local de SP) da semana que contém `now`. */
export function mondayOf(now: Date): string {
  const local = spMs(now);
  const midnight = Math.floor(local / DAY) * DAY;
  const dow = new Date(midnight).getUTCDay(); // 0 domingo
  return isoDate(midnight - ((dow + 6) % 7) * DAY);
}
export function addWeeks(week: string, n: number): string {
  return isoDate(Date.parse(`${week}T00:00:00Z`) + n * 7 * DAY);
}
/** Instante (UTC) em que a semana `week` entra no ar. */
export function activateAt(week: string, s: ShowcaseSchedule): Date {
  return fromSp(Date.parse(`${week}T00:00:00Z`) + s.activateHour * 3_600_000);
}
/** Instante (UTC) em que a edição da semana `week` começa a ser preparada (antes da segunda). */
export function prepareAt(week: string, s: ShowcaseSchedule): Date {
  const monday = Date.parse(`${week}T00:00:00Z`);
  const daysBefore = (1 - s.prepareDow + 7) % 7 || 7;
  return fromSp(monday - daysBefore * DAY + s.prepareHour * 3_600_000);
}
/** Semana que deve estar no ar agora (a segunda só vale depois do horário de ativação). */
export function liveWeek(now: Date, s: ShowcaseSchedule): string {
  const w = mondayOf(now);
  return now >= activateAt(w, s) ? w : addWeeks(w, -1);
}

export interface Candidate {
  propertyId: string;
  publicId: string;
  mediaId: string;
  mediaVersion: string;
  width: number | null;
  height: number | null;
  publishedAt: string;
}
export const isLandscape = (c: Pick<Candidate, "width" | "height">) =>
  !!c.width && !!c.height && c.width >= c.height * 1.2;

/** Imóvel mais recente com capa horizontal que não apareceu nas últimas semanas. */
export function chooseCandidate(cands: Candidate[], recentPropertyIds: string[]): Candidate | null {
  const ordered = cands.filter(isLandscape).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const used = new Set(recentPropertyIds);
  return ordered.find((c) => !used.has(c.propertyId)) ?? ordered[0] ?? null;
}

export type WeekRow = { id: string; week_start: string; state: ShowcaseState; approved_at: string | null; use_original: boolean };
export type WorkerAction =
  | { kind: "create"; week: string }
  | { kind: "generate"; weekId: string }
  | { kind: "activate"; weekId: string; withOriginal: boolean }
  | { kind: "create-and-activate"; week: string };

/** Decide o que a rotina faz agora. Nunca reenvia um caso incerto nem regera algo pronto. */
export function planWorker(now: Date, s: ShowcaseSchedule, rows: WeekRow[], paused: boolean): WorkerAction[] {
  if (paused) return [];
  const actions: WorkerAction[] = [];
  const current = (week: string) => rows.find((r) => r.week_start === week && r.state !== "recusado" && r.state !== "substituido");
  const live = liveWeek(now, s);
  const next = addWeeks(live, 1);
  const liveRow = current(live);
  if (!liveRow) actions.push({ kind: "create-and-activate", week: live });
  else if (liveRow.state !== "ativo" && liveRow.state !== "encerrado")
    actions.push({ kind: "activate", weekId: liveRow.id, withOriginal: !(liveRow.state === "pronto" && liveRow.approved_at) });
  if (now >= prepareAt(next, s)) {
    const nextRow = current(next);
    if (!nextRow) actions.push({ kind: "create", week: next });
    else if (nextRow.state === "agendado") actions.push({ kind: "generate", weekId: nextRow.id });
  }
  return actions;
}

/** Um pedido de nova edição só é aceito quando nada está em andamento. */
export function canRegenerate(state: ShowcaseState): boolean {
  return ["aguardando_revisao", "pronto", "falhou", "ativo", "incerto"].includes(state);
}
