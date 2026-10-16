import { z } from "zod";
import { operationalRoles } from "../security";
import { attendanceQuery, attendanceRecord, limitSchema, rows } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "list_attendances",
  title: "Listar atendimentos",
  description:
    "Consulta atendimentos recentes da carteira e imobiliária permitidas, com etapa e próximo retorno.",
  roles: operationalRoles,
  inputSchema: z
    .object({ status: z.string().trim().max(40).optional(), limit: limitSchema })
    .strict(),
  async handler({ status, limit = 20 }, ctx) {
    let q = attendanceQuery(ctx)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (status) q = q.eq("status", status);
    const data = await rows(q, ctx);
    const attendances = data.slice(0, limit).map(attendanceRecord);
    return result(
      attendances.length
        ? `${attendances.length} atendimento(s).`
        : "Não encontrei atendimentos com esses critérios.",
      { attendances, total: attendances.length, limited: data.length > limit },
    );
  },
} satisfies AgentTool;
