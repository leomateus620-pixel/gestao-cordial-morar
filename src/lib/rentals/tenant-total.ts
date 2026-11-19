/**
 * Tenant total for one rent occurrence (what the boleto charges). Pure and browser-safe.
 * Reuses computeReceiptTotals: honorários never change what the tenant pays.
 */
import {
  activeRecurringFor,
  computeReceiptTotals,
  type RecurringAdjustment,
  type TenantAdjustment,
} from "./receipt-model";

export type TenantTotalSource = {
  fonte: "recibo" | "contrato";
  aluguel: number;
  condominio: number;
  iptu: number;
  seguroFianca: number;
  ajustesInquilino: Pick<TenantAdjustment, "tipo" | "descricao" | "valor">[];
};
export type TenantTotalLine = { rotulo: string; centavos: number };

const money = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);

/** Receipt `valores` win (they are the occurrence actually billed); else contract + recurring. */
export function tenantTotalSourceFor(
  contract: { valorMensal: number; seguroValorMensal?: number | null },
  competencia: string,
  opts: { receiptValores?: unknown; recurring?: RecurringAdjustment[] } = {},
): TenantTotalSource {
  const r = opts.receiptValores as Record<string, unknown> | null | undefined;
  if (r && typeof r === "object" && typeof r.aluguel === "number") {
    const adj = Array.isArray(r.ajustesInquilino) ? r.ajustesInquilino : [];
    return {
      fonte: "recibo",
      aluguel: money(r.aluguel),
      condominio: money(r.condominio),
      iptu: money(r.iptu),
      seguroFianca: money(r.seguroFianca),
      ajustesInquilino: adj
        .filter(
          (a): a is TenantAdjustment =>
            !!a &&
            typeof a === "object" &&
            (a.tipo === "acrescimo" || a.tipo === "desconto") &&
            typeof a.valor === "number" &&
            Number.isFinite(a.valor) &&
            a.valor > 0,
        )
        .map((a) => ({
          tipo: a.tipo,
          descricao: String(a.descricao ?? "").slice(0, 120),
          valor: a.valor,
        })),
    };
  }
  return {
    fonte: "contrato",
    aluguel: money(contract.valorMensal),
    condominio: 0,
    iptu: 0,
    seguroFianca: money(contract.seguroValorMensal),
    ajustesInquilino: activeRecurringFor(opts.recurring ?? [], competencia).map((a) => ({
      tipo: a.tipo,
      descricao: a.descricao,
      valor: a.valor,
    })),
  };
}

export function tenantTotal(src: TenantTotalSource) {
  const t = computeReceiptTotals({
    competencia: "",
    brand: "cordial",
    aluguel: src.aluguel,
    honorarios: 0,
    condominio: src.condominio,
    iptu: src.iptu,
    iptuParcela: "",
    seguroFianca: src.seguroFianca,
    observacao: "",
    vencimento: "",
    ajustesInquilino: src.ajustesInquilino.map((a, i) => ({
      id: String(i),
      tipo: a.tipo,
      descricao: a.descricao,
      valor: a.valor,
      repassarProprietario: false,
    })),
    ajustesProprietario: [],
  });
  const c = (n: number) => Math.round(n * 100);
  const linhas: TenantTotalLine[] = [{ rotulo: "Aluguel", centavos: c(src.aluguel) }];
  if (src.condominio) linhas.push({ rotulo: "Condomínio", centavos: c(src.condominio) });
  if (src.iptu) linhas.push({ rotulo: "IPTU", centavos: c(src.iptu) });
  if (src.seguroFianca) linhas.push({ rotulo: "Seguro Fiança", centavos: c(src.seguroFianca) });
  for (const a of src.ajustesInquilino)
    linhas.push({
      rotulo: `${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"} – ${a.descricao}`,
      centavos: a.tipo === "acrescimo" ? c(a.valor) : -c(a.valor),
    });
  return { totalCentavos: Math.round(t.totalPagar * 100), linhas };
}
