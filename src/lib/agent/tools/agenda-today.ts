import { z } from "zod";
import { operationalRoles, scopeAgency } from "../security";
import { daySchema, rows, saoPauloDay } from "./common";
import { result, type AgentTool } from "./types";
export const AGENDA_COLUMNS =
  "id,titulo,tipo,status,inicio,fim,imobiliaria,cliente_nome,imovel_id,responsavel_nome";
export const agendaRecord = (e: any) => ({
  id: e.id,
  titulo: e.titulo,
  tipo: e.tipo,
  status: e.status,
  inicio: e.inicio,
  fim: e.fim,
  imobiliaria: e.imobiliaria,
  cliente: e.cliente_nome,
  responsavel: e.responsavel_nome,
  href: `/agenda?id=${e.id}`,
});
export default {
  name: "agenda_today",
  title: "Consultar agenda do dia",
  description:
    "Compromissos do dia em Brasília, incluindo participações autorizadas pelas políticas da Agenda.",
  roles: operationalRoles,
  inputSchema: z.object({ date: daySchema.optional() }).strict(),
  async handler({ date = saoPauloDay() }, ctx) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const data = await rows(
      scopeAgency(
        ctx.supabase
          .from("agenda_events")
          .select(AGENDA_COLUMNS)
          .is("deleted_at", null)
          .gte("inicio", `${date}T00:00:00-03:00`)
          .lt("inicio", `${next.toISOString().slice(0, 10)}T00:00:00-03:00`),
        ctx,
        "imobiliaria",
      )
        .order("inicio", { ascending: true })
        .limit(101),
      ctx,
    );
    const events = data.slice(0, 100).map(agendaRecord);
    return result(
      events.length
        ? `${events.length} compromisso(s) em ${date}.`
        : "Não encontrei compromissos para esse dia.",
      {
        events,
        total: events.length,
        limited: data.length > 100,
        date,
        timeZone: "America/Sao_Paulo",
        href: "/agenda",
      },
    );
  },
} satisfies AgentTool;
