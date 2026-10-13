import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "rentals_financial_summary",
  title: "Resumo financeiro de aluguéis",
  description:
    "Resumo dos contratos de aluguel (ativos, valores, comissões, situação de pagamento) e das NFS-e de uma competência, por empresa (somente leitura).",
  inputSchema: {
    competencia: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe("Competência AAAA-MM para o resumo de NFS-e (padrão: mês anterior)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ competencia }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Não autenticado");
    const supabase = supabaseForUser(ctx);

    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const comp = competencia ?? prev.toISOString().slice(0, 7);

    const [contractsRes, nfseRes] = await Promise.all([
      supabase
        .from("rental_contracts")
        .select("brand,status,payment_status,valor_mensal,comissao_mensal,proximo_vencimento")
        .limit(2000),
      supabase
        .from("rental_nfse_emissions")
        .select("brand,status,modo_teste,valor")
        .eq("competencia", comp)
        .limit(2000),
    ]);
    if (contractsRes.error) throw new ToolError(contractsRes.error.message);
    if (nfseRes.error) throw new ToolError(nfseRes.error.message);

    const contracts = contractsRes.data ?? [];
    const ativos = contracts.filter((c) => c.status === "ativo");
    const porEmpresa = (brand: string) => {
      const list = ativos.filter((c) => c.brand === brand);
      return {
        contratosAtivos: list.length,
        totalAlugueis: list.reduce((s, c) => s + (c.valor_mensal ?? 0), 0),
        totalComissoes: list.reduce((s, c) => s + (c.comissao_mensal ?? 0), 0),
      };
    };
    const porPagamento: Record<string, number> = {};
    for (const c of ativos) porPagamento[c.payment_status] = (porPagamento[c.payment_status] ?? 0) + 1;

    const nfse = nfseRes.data ?? [];
    const nfsePorStatus: Record<string, number> = {};
    for (const n of nfse) {
      const k = n.modo_teste ? `${n.status} (teste)` : n.status;
      nfsePorStatus[k] = (nfsePorStatus[k] ?? 0) + 1;
    }

    const summary = {
      competencia: comp,
      contratos: {
        total: contracts.length,
        ativos: ativos.length,
        porEmpresa: { cordial: porEmpresa("cordial"), morar: porEmpresa("morar") },
        porSituacaoPagamento: porPagamento,
      },
      nfse: { total: nfse.length, porStatus: nfsePorStatus },
    };
    return {
      content: [
        {
          type: "text",
          text: `${ativos.length} aluguéis ativos; NFS-e ${comp}: ${nfse.length} emissão(ões).`,
        },
      ],
      structuredContent: summary,
    };
  },
});
