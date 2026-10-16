import { z } from "zod";
import { operationalRoles } from "../security";
import { groupBy, rows, safeLike } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "portfolio_summary",
  title: "Resumo da carteira",
  description:
    "Resumo limitado da carteira compartilhada por situação, finalidade, imobiliária e cidade.",
  roles: operationalRoles,
  inputSchema: z.object({ cidade: z.string().trim().max(80).optional() }).strict(),
  async handler({ cidade }, ctx) {
    let q = ctx.supabase
      .from("properties")
      .select("disponibilidade,finalidade,cidade,carteira,publish_targets,exibir_imovel,is_draft")
      .is("archived_at", null)
      .limit(1000);
    if (cidade && safeLike(cidade)) q = q.ilike("cidade", `%${safeLike(cidade)}%`);
    const data = await rows(q, ctx);
    const sample = data.slice(0, 1000);
    return result(
      `${sample.length} imóvel(is) na consulta${data.length >= 1000 ? " (amostra limitada)" : ""}.`,
      {
        total: sample.length,
        limited: data.length >= 1000,
        porSituacao: groupBy(sample, "disponibilidade"),
        porFinalidade: groupBy(sample, "finalidade"),
        porEmpresa: groupBy(sample, "carteira"),
        porCidade: groupBy(sample, "cidade"),
        anunciosPorSite: {
          cordial: sample.filter((p) => p.publish_targets?.includes("cordial")).length,
          morar: sample.filter((p) => p.publish_targets?.includes("morar")).length,
        },
        visiveisNoSite: sample.filter((p) => p.exibir_imovel).length,
        rascunhos: sample.filter((p) => p.is_draft).length,
        href: "/imoveis",
      },
    );
  },
} satisfies AgentTool;
