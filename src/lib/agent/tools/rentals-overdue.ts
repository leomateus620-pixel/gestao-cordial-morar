import { z } from "zod";
import { canSeeFinancialValues, scopeAgency } from "../security";
import { limitSchema, rows, saoPauloDay } from "./common";
import { result, type AgentTool } from "./types";
export function rentalColumns(ctx: any): string {
  return `id,brand,status,payment_status,proximo_vencimento,data_inicio,data_fim${canSeeFinancialValues(ctx) ? ",valor_mensal,comissao_mensal" : ""}`;
}
export function rentalRecord(c: any, ctx: any) {
  return {
    id: c.id,
    imobiliaria: c.brand,
    status: c.status,
    pagamento: c.payment_status,
    vencimento: c.proximo_vencimento,
    inicio: c.data_inicio,
    fim: c.data_fim,
    ...(canSeeFinancialValues(ctx)
      ? { valor: Number(c.valor_mensal || 0), comissao: Number(c.comissao_mensal || 0) }
      : {}),
    href: `/alugueis?id=${c.id}`,
  };
}
export default {
  name: "rentals_overdue",
  title: "Aluguéis em atraso",
  description:
    "Consulta contratos ativos com vencimento anterior a hoje e pagamento fora de em dia. Não emite documentos nem notas.",
  roles: ["admin", "secretaria"],
  inputSchema: z.object({ limit: limitSchema }).strict(),
  async handler({ limit = 20 }, ctx) {
    const data = await rows(
      scopeAgency(
        ctx.supabase.from("rental_contracts").select(rentalColumns(ctx)),
        ctx,
        "brand",
        false,
      )
        .eq("status", "ativo")
        .neq("payment_status", "em_dia")
        .lt("proximo_vencimento", saoPauloDay())
        .order("proximo_vencimento", { ascending: true })
        .limit(limit + 1),
      ctx,
    );
    const contracts = data.slice(0, limit).map((c) => rentalRecord(c, ctx));
    return result(
      contracts.length
        ? `${contracts.length} contrato(s) com pagamento pendente e vencimento anterior a hoje.`
        : "Não encontrei contratos em atraso com vencimento informado.",
      { contracts, total: contracts.length, limited: data.length > limit, href: "/alugueis" },
    );
  },
} satisfies AgentTool;
