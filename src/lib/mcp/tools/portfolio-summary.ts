import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "portfolio_summary",
  title: "Resumo da carteira de imóveis",
  description:
    "Totais da carteira de imóveis por situação, finalidade, cidade e empresa (Cordial/Morar), com contagem de anúncios publicados por site (somente leitura).",
  inputSchema: {
    cidade: z.string().trim().max(80).optional().describe("Filtrar por cidade."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ cidade }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    let q = supabaseForUser(ctx)
      .from("properties")
      .select("disponibilidade,finalidade,cidade,bairro,carteira,publish_targets,exibir_imovel,is_draft")
      .is("archived_at", null)
      .limit(5000);
    if (cidade) q = q.ilike("cidade", `%${cidade.replace(/[%_]/g, " ")}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);

    const rows = data ?? [];
    const count = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).length;
    const groupBy = (key: (r: (typeof rows)[number]) => string | null) => {
      const acc: Record<string, number> = {};
      for (const r of rows) {
        const k = key(r) ?? "não informado";
        acc[k] = (acc[k] ?? 0) + 1;
      }
      return Object.fromEntries(Object.entries(acc).sort((a, b) => b[1] - a[1]));
    };

    const summary = {
      total: rows.length,
      porSituacao: groupBy((r) => r.disponibilidade),
      porFinalidade: groupBy((r) => r.finalidade),
      porEmpresa: groupBy((r) => r.carteira),
      porCidade: groupBy((r) => r.cidade),
      anunciosPorSite: {
        cordial: count((r) => r.publish_targets?.includes("cordial")),
        morar: count((r) => r.publish_targets?.includes("morar")),
      },
      visiveisNoSite: count((r) => r.exibir_imovel),
      rascunhos: count((r) => r.is_draft),
    };
    return {
      content: [
        {
          type: "text",
          text: `Carteira com ${summary.total} imóvel(is): ${Object.entries(summary.porSituacao)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")}.`,
        },
      ],
      structuredContent: summary,
    };
  },
});
