import { z } from "zod";
import { operationalRoles } from "../security";
import {
  attendanceQuery,
  attendanceRecord,
  limitSchema,
  OPEN_ATTENDANCE_STATUSES,
  rows,
} from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "stale_attendances",
  title: "Atendimentos sem avanço",
  description:
    "Atendimentos ativos sem atualização há pelo menos o número informado de dias; respeita carteira e imobiliária.",
  roles: operationalRoles,
  inputSchema: z
    .object({ days: z.number().int().min(1).max(90).optional(), limit: limitSchema })
    .strict(),
  async handler({ days = 7, limit = 20 }, ctx) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const data = await rows(
      attendanceQuery(ctx)
        .in("status", OPEN_ATTENDANCE_STATUSES)
        .lt("updated_at", cutoff)
        .order("updated_at", { ascending: true })
        .limit(limit + 1),
      ctx,
    );
    const attendances = data.slice(0, limit).map(attendanceRecord);
    return result(
      attendances.length
        ? `${attendances.length} atendimento(s) sem atualização há ${days} dias ou mais.`
        : "Não encontrei atendimentos parados nesse período.",
      {
        attendances,
        total: attendances.length,
        limited: data.length > limit,
        days,
        href: "/atendimentos",
      },
    );
  },
} satisfies AgentTool;
