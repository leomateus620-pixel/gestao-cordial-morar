import { z } from "zod";
import { scopeAgency } from "../security";
import { rows, limitSchema } from "./common";
import { result, type AgentTool } from "./types";

export default {
  name: "rental_nfse_alerts",
  title: "Consultando pendências fiscais",
  description:
    "Lista emissões já registradas que precisam de conferência. Nunca emite ou reenvia NFS-e, não lê XML, snapshots ou dados fiscais de proprietários.",
  roles: ["admin", "secretaria"],
  inputSchema: z.object({ limit: limitSchema }).strict(),
  async handler({ limit = 20 }, ctx) {
    const data = await rows(
      scopeAgency(
        ctx.supabase
          .from("rental_nfse_emissions")
          .select("id,contract_id,brand,competencia,status,modo_teste,created_at"),
        ctx,
        "brand",
        false,
      )
        .in("status", ["erro", "incerto", "processando", "nao_emitida"])
        .order("created_at", { ascending: false })
        .limit(limit + 1),
      ctx,
    );
    const alerts = data
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        contratoId: r.contract_id,
        competencia: r.competencia,
        status: r.status,
        teste: r.modo_teste,
        href: `/alugueis?id=${r.contract_id}`,
      }));
    return result(
      alerts.length
        ? `${alerts.length} emissão(ões) registrada(s) para conferir no módulo de aluguéis.`
        : "Não encontrei emissões registradas com pendências.",
      { alerts, total: alerts.length, limited: data.length > limit, href: "/alugueis" },
    );
  },
} satisfies AgentTool;
