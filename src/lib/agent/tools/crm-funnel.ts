import { z } from "zod";
import { operationalRoles } from "../security";
import { attendanceQuery, groupBy, OPEN_ATTENDANCE_STATUSES, rows } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "crm_funnel",
  title: "Funil de atendimentos",
  description:
    "Contagens por etapa, status e imobiliária exclusivamente dos atendimentos permitidos.",
  roles: operationalRoles,
  inputSchema: z.object({ diasParado: z.number().int().min(1).max(90).optional() }).strict(),
  async handler({ diasParado = 7 }, ctx) {
    const data = await rows(
      attendanceQuery(ctx).order("updated_at", { ascending: false }).limit(1000),
      ctx,
    );
    const sample = data.slice(0, 1000);
    const cutoff = Date.now() - diasParado * 86400000;
    const parados = sample.filter(
      (a) =>
        OPEN_ATTENDANCE_STATUSES.includes(a.status) &&
        new Date(a.proximo_retorno ?? a.updated_at ?? a.created_at).getTime() < cutoff,
    );
    return result(
      `${sample.length} atendimento(s); ${parados.length} parado(s) há mais de ${diasParado} dias.`,
      {
        total: sample.length,
        limited: data.length >= 1000,
        porEtapa: groupBy(sample, "pipeline_stage"),
        porStatus: groupBy(sample, "status"),
        porImobiliaria: groupBy(sample, "imobiliaria"),
        porFinalidade: groupBy(sample, "finalidade"),
        paradosHaXDias: { dias: diasParado, quantidade: parados.length },
        href: "/atendimentos",
      },
    );
  },
} satisfies AgentTool;
