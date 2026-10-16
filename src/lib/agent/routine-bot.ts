/** Kept in parity with assistant_routine_bot() in the additive configuration migration. */
export function botForRoutineTemplate(template: string): string {
  const mapping: Record<string, string> = {
    daily_briefing: "agenda",
    agenda_today: "agenda",
    stale_attendances: "lead",
    expiring_agenciamentos: "capta",
    rentals_overdue: "caixa",
    new_matches: "match",
    broker_ranking: "time",
    market_digest: "mercado",
  };
  const bot = mapping[template];
  if (!bot) throw new Error("routine_template_invalid");
  return bot;
}
