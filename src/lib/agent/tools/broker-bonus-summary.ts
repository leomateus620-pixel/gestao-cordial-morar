import { z } from "zod";
import { rows, limitSchema } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "broker_bonus_summary",
  title: "Consultando bônus da equipe",
  description:
    "Consulta bônus registrados de agenciamento. Não calcula pagamentos ou qualidade de corretores a partir de volume.",
  roles: ["admin"],
  inputSchema: z.object({ limit: limitSchema }).strict(),
  async handler({ limit = 20 }, ctx) {
    const data = await rows(
      ctx.supabase
        .from("agenciamento_bonuses")
        .select(
          "id,corretor_id,corretor_nome,categoria,nivel,status,periodo_ref,listings_count,placas_count,achieved_at",
        )
        .order("achieved_at", { ascending: false })
        .limit(limit + 1),
      ctx,
    );
    const bonuses = data
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        corretor: r.corretor_nome,
        categoria: r.categoria,
        nivel: r.nivel,
        status: r.status,
        periodo: r.periodo_ref,
        agenciamentos: r.listings_count,
        placas: r.placas_count,
        href: `/corretores?corretorId=${r.corretor_id}`,
      }));
    return result(
      bonuses.length
        ? `${bonuses.length} bônus registrado(s) na amostra.`
        : "Não encontrei bônus registrados.",
      { bonuses, total: bonuses.length, limited: data.length > limit, href: "/corretores" },
    );
  },
} satisfies AgentTool;
