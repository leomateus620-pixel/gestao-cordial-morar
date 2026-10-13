import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "crm_funnel",
  title: "Funil de atendimentos",
  description:
    "Funil de atendimentos por etapa, status e imobiliária, com contagem de atendimentos parados sem retorno agendado ou vencidos (somente leitura).",
  inputSchema: {
    diasParado: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe("Considerar parado após X dias sem retorno (padrão 7)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ diasParado }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    const { data, error } = await supabaseForUser(ctx)
      .from("attendances")
      .select("status,pipeline_stage,imobiliaria,finalidade,proximo_retorno,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new ToolError(error.message);

    const rows = data ?? [];
    const groupBy = (key: (r: (typeof rows)[number]) => string | null) => {
      const acc: Record<string, number> = {};
      for (const r of rows) {
        const k = key(r) ?? "não informado";
        acc[k] = (acc[k] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(acc).sort((a, b) => b[1] - a[1]));
    };

    const limite = Date.now() - (diasParado ?? 7) * 24 * 60 * 60 * 1000;
    const parados = rows.filter((r) => {
      if (r.status !== "em_andamento" && r.status !== "novo") return false;
      const ref = r.proximo_retorno ?? r.created_at;
      return ref ? new Date(ref).getTime() < limite : false;
    });

    const summary = {
      total: rows.length,
      porEtapa: groupBy((r) => r.pipeline_stage),
      porStatus: groupBy((r) => r.status),
      porImobiliaria: groupBy((r) => r.imobiliaria),
      porFinalidade: groupBy((r) => r.finalidade),
      paradosHaXDias: { dias: diasParado ?? 7, quantidade: parados.length },
    };
    return {
      content: [
        {
          type: "text",
          text: `${rows.length} atendimento(s); ${parados.length} parado(s) há mais de ${diasParado ?? 7} dias.`,
        },
      ],
      structuredContent: summary,
    };
  },
});
