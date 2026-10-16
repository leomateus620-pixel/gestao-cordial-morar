import { z } from "zod";
export const routineTemplate = z.enum([
  "daily_briefing",
  "agenda_today",
  "stale_attendances",
  "expiring_agenciamentos",
  "rentals_overdue",
  "new_matches",
  "broker_ranking",
  "market_digest",
]);
export const routineProposal = z
  .object({
    name: z.string().trim().min(3).max(80),
    template: routineTemplate,
    hour: z.number().int().min(0).max(23).default(8),
    minute: z.number().int().min(0).max(59).default(0),
    timeZone: z.literal("America/Sao_Paulo").default("America/Sao_Paulo"),
    days: z.enum(["every_day", "weekdays", "weekly"]).default("every_day"),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
  })
  .strict();
export type RoutineProposal = z.infer<typeof routineProposal>;
export function proposeRoutine(message: string): { proposal: RoutineProposal; summary: string } {
  if (
    /envi[aeor].*(cliente|whatsapp|email)|emitir|publicar|apagar|excluir.*registro/i.test(message)
  )
    throw new Error("Rotinas podem somente consultar o Gestão e avisar você.");
  if (/amanh[ãa]|ontem/i.test(message))
    throw new Error(
      "Esta rotina resume a agenda do próprio dia. Para outro dia, consulte o agente Agenda.",
    );
  const template = /match|compat[ií]ve|im[oó]ve.*nov/i.test(message)
    ? "new_matches"
    : /mercado|[ií]ndice|ipca|igp/i.test(message)
      ? "market_digest"
      : /corretor|ranking|equipe/i.test(message)
        ? "broker_ranking"
        : /alug|atras|repasse/i.test(message)
          ? "rentals_overdue"
          : /capta|agenciamento|document/i.test(message)
            ? "expiring_agenciamentos"
            : /lead|parad|atendimento/i.test(message)
              ? "stale_attendances"
              : /agenda|visita|compromisso/i.test(message)
                ? "agenda_today"
                : "daily_briefing";
  const weeklyDays: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
  };
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const weekly = Object.keys(weeklyDays).find((day) => normalized.includes(day));
  const days = /uteis/.test(normalized)
    ? "weekdays"
    : weekly || /seman/.test(normalized)
      ? "weekly"
      : "every_day";
  const dayOfWeek = days === "weekly" ? weeklyDays[weekly ?? "segunda"] : undefined;
  const match = message.match(/(?:[aà]s?\s+)(\d{1,2})(?::|h)?(\d{2})?/i);
  const hour = match ? Number(match[1]) : 8,
    minute = match?.[2] ? Number(match[2]) : 0;
  const labels: Record<string, string> = {
    daily_briefing: "Seu dia",
    agenda_today: "Resumo da agenda",
    stale_attendances: "Atendimentos sem avanço",
    expiring_agenciamentos: "Pendências de captação",
    rentals_overdue: "Aluguéis em atraso",
    new_matches: "Novos imóveis compatíveis",
    broker_ranking: "Panorama da equipe",
    market_digest: "Mercado imobiliário",
  };
  const proposal = routineProposal.parse({
    name: labels[template],
    template,
    hour,
    minute,
    timeZone: "America/Sao_Paulo",
    days,
    dayOfWeek,
  });
  return {
    proposal,
    summary: `${proposal.name}, ${days === "every_day" ? "todos os dias" : days === "weekdays" ? "nos dias úteis" : "uma vez por semana"} às ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} de Brasília. Somente consultas e um aviso para você.`,
  };
}
export function nextRoutineRun(
  hour: number,
  minute: number,
  now = new Date(),
  days: "every_day" | "weekdays" | "weekly" = "every_day",
  dayOfWeek?: number,
): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Contemporary Brasília has UTC−03. Intl resolves the real offset at each target date.
  const toUtc = (key: string) => {
    let candidate = new Date(
      `${key}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
    );
    for (let i = 0; i < 2; i++) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(candidate);
      const v = (k: string) => Number(parts.find((p) => p.type === k)?.value);
      const viewed = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"));
      const desired = Date.parse(
        `${key}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
      );
      candidate = new Date(candidate.getTime() + desired - viewed);
    }
    return candidate;
  };
  let target = toUtc(day);
  const allowed = (value: Date) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
    return (
      days === "every_day" ||
      (days === "weekdays" ? dow >= 1 && dow <= 5 : dow === (dayOfWeek ?? 1))
    );
  };
  let offset = 0;
  while (target <= now || !allowed(target)) {
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + ++offset);
    target = toUtc(next.toISOString().slice(0, 10));
  }
  return target.toISOString();
}
