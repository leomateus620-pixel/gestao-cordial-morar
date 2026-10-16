import { z } from "zod";
import { canSeeFinancialValues, scopeAgency } from "../security";
import { groupBy, previousMonth, rows } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "rentals_financial_summary",
  title: "Resumo dos aluguéis",
  description:
    "Situação dos contratos e NFS-e permitidos; indicadores monetários são exclusivos do administrador.",
  roles: ["admin", "secretaria"],
  inputSchema: z
    .object({
      competencia: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
        .optional(),
    })
    .strict(),
  async handler({ competencia = previousMonth() }, ctx) {
    const financial = canSeeFinancialValues(ctx);
    const [contractsData, nfseData] = await Promise.all([
      rows(
        scopeAgency(
          ctx.supabase
            .from("rental_contracts")
            .select(
              `brand,status,payment_status${financial ? ",valor_mensal,comissao_mensal" : ""}`,
            ),
          ctx,
          "brand",
          false,
        ).limit(1000),
        ctx,
      ),
      rows(
        scopeAgency(
          ctx.supabase
            .from("rental_nfse_emissions")
            .select("brand,status,modo_teste")
            .eq("competencia", competencia),
          ctx,
          "brand",
          false,
        ).limit(1000),
        ctx,
      ),
    ]);
    const contracts = contractsData.slice(0, 1000),
      nfse = nfseData.slice(0, 1000),
      active = contracts.filter((c) => c.status === "ativo");
    const porEmpresa = Object.fromEntries(
      ["cordial", "morar"].map((brand) => {
        const list = active.filter((c) => c.brand === brand);
        return [
          brand,
          {
            contratosAtivos: list.length,
            ...(financial
              ? {
                  totalAlugueis: list.reduce((sum, c) => sum + Number(c.valor_mensal || 0), 0),
                  totalComissoes: list.reduce((sum, c) => sum + Number(c.comissao_mensal || 0), 0),
                }
              : {}),
          },
        ];
      }),
    );
    return result(
      `${active.length} aluguéis ativos; NFS-e ${competencia}: ${nfse.length} emissão(ões).`,
      {
        competencia,
        total: contracts.length,
        limited: contractsData.length >= 1000 || nfseData.length >= 1000,
        contratos: {
          total: contracts.length,
          ativos: active.length,
          porEmpresa,
          porSituacaoPagamento: groupBy(active, "payment_status"),
        },
        nfse: {
          total: nfse.length,
          porStatus: groupBy(
            nfse.map((n) => ({ ...n, status: n.modo_teste ? `${n.status} (teste)` : n.status })),
            "status",
          ),
        },
        href: "/alugueis",
      },
    );
  },
} satisfies AgentTool;
