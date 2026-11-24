/** Pure boleto preview: validations, tenant total and the immutable snapshot. Browser-safe. */
import type { RecurringAdjustment } from "@/lib/rentals/receipt-model";
import {
  tenantTotal,
  tenantTotalSourceFor,
  type TenantTotalLine,
} from "@/lib/rentals/tenant-total";
import {
  maskDocumento,
  normalizePagador,
  resolveVencimento,
  type BillingAmbiente,
  type BoletoBrand,
  type Encargos,
  type PagadorNormalizado,
  type PagadorSource,
  type Pendencia,
  type VencimentoResult,
} from "./rules";
import { SANDBOX_PAGADOR } from "./sicredi/body";

export type BoletoContractData = {
  id: string;
  brand: string;
  status: string;
  diaVencimento: number;
  proximoVencimento: string | null;
  valorMensal: number;
  seguroValorMensal: number | null;
};
export type BoletoSnapshot = {
  versao: 1;
  fonte: "recibo" | "contrato";
  competencia: string;
  composicao: TenantTotalLine[];
  total_centavos: number;
  vencimento: { data: string; original: string; alterado: boolean };
  pagador: PagadorNormalizado;
  encargos: Encargos;
  conta: { brand: BoletoBrand; ambiente: BillingAmbiente };
  /** Account brand and contract brand (an "ambas" contract issues from the chosen account). */
  marca_conta?: BoletoBrand;
  marca_contrato?: string;
  /** Sandbox only: the payer above is the fixed fictitious one; the tenant is a reference. */
  pagador_ficticio?: true;
  pagador_referencia?: { tenantId: string | null };
  especieDocumento: "RECIBO";
  tipoCobranca: "NORMAL";
};
export type BoletoPreview = {
  ok: boolean;
  bloqueios: string[];
  pendencias: Pendencia[];
  /** Sandbox: tenant gaps shown as warnings (they block only in production). */
  avisos: Pendencia[];
  pagadorFicticio: boolean;
  vencimento: VencimentoResult | null;
  totalCentavos: number;
  linhas: TenantTotalLine[];
  fonte: "recibo" | "contrato";
  pagador: { nome: string; documento: string; cidadeUf: string } | null;
  ambiente: BillingAmbiente | null;
  encargosAtivos: boolean;
  marcaConta: BoletoBrand | null;
  marcaContrato: string;
  snapshot: BoletoSnapshot | null;
};

export function buildBoletoPreview(args: {
  contract: BoletoContractData;
  pagador: PagadorSource;
  tenantId?: string | null;
  competencia: string;
  today: string;
  novoVencimento?: string | null;
  receiptValores?: unknown;
  recurring?: RecurringAdjustment[];
  account: { ambiente: BillingAmbiente; encargos: Encargos } | null;
  /** Brand resolved on the server (resolveIssuingBrand); omitted = contract brand. */
  issuingBrand?: BoletoBrand | null;
  issuingBrandMotivo?: string | null;
}): BoletoPreview {
  const bloqueios: string[] = [];
  const c = args.contract;
  const own = c.brand === "cordial" || c.brand === "morar" ? (c.brand as BoletoBrand) : null;
  const brand = args.issuingBrand !== undefined ? args.issuingBrand : own;
  if (!brand)
    bloqueios.push(
      args.issuingBrandMotivo ??
        "Defina a marca do contrato (Cordial ou Morar) antes de emitir o boleto.",
    );
  if (c.status === "encerrado" || c.status === "cancelado")
    bloqueios.push("Contrato encerrado ou cancelado: não é possível emitir boleto.");
  let vencimento: VencimentoResult | null = null;
  try {
    vencimento = resolveVencimento({
      competencia: args.competencia,
      diaVencimento: c.diaVencimento,
      today: args.today,
      novoVencimento: args.novoVencimento ?? null,
    });
    if (c.proximoVencimento && c.proximoVencimento > vencimento.original)
      bloqueios.push("Esta parcela já recebeu baixa no Gestão (o próximo vencimento é posterior).");
    if (!vencimento.ok) bloqueios.push(vencimento.message);
  } catch (e) {
    bloqueios.push(e instanceof Error ? e.message : "Vencimento inválido.");
  }
  const src = tenantTotalSourceFor(
    { valorMensal: c.valorMensal, seguroValorMensal: c.seguroValorMensal },
    args.competencia,
    { receiptValores: args.receiptValores, recurring: args.recurring },
  );
  const total = tenantTotal(src);
  if (total.totalCentavos <= 0) bloqueios.push("O total do inquilino precisa ser maior que zero.");
  const pag = normalizePagador(args.pagador);
  const sandbox = args.account?.ambiente === "sandbox";
  const faltas = pag.ok ? [] : pag.pendencias;
  const pendencias = sandbox ? [] : faltas;
  const avisos = sandbox ? faltas : [];
  const pagadorEnvio = sandbox ? { ...SANDBOX_PAGADOR } : pag.ok ? pag.pagador : null;
  if (!args.account)
    bloqueios.push("Nenhuma conta de cobrança Sicredi configurada para esta marca.");
  const ok = bloqueios.length === 0 && pendencias.length === 0;
  const encargos: Encargos = args.account?.encargos.ativo
    ? args.account.encargos
    : { ativo: false };
  return {
    ok,
    bloqueios,
    pendencias,
    avisos,
    pagadorFicticio: sandbox,
    vencimento,
    totalCentavos: total.totalCentavos,
    linhas: total.linhas,
    fonte: src.fonte,
    pagador: pagadorEnvio
      ? {
          nome: pagadorEnvio.nome,
          documento: maskDocumento(pagadorEnvio.documento),
          cidadeUf: `${pagadorEnvio.cidade}/${pagadorEnvio.uf}`,
        }
      : null,
    ambiente: args.account?.ambiente ?? null,
    encargosAtivos: encargos.ativo,
    marcaConta: brand,
    marcaContrato: c.brand,
    snapshot:
      ok && pagadorEnvio && brand && vencimento?.ok && args.account
        ? {
            versao: 1,
            fonte: src.fonte,
            competencia: args.competencia,
            composicao: total.linhas,
            total_centavos: total.totalCentavos,
            vencimento: {
              data: vencimento.vencimento,
              original: vencimento.original,
              alterado: vencimento.alterado,
            },
            pagador: pagadorEnvio,
            encargos,
            conta: { brand, ambiente: args.account.ambiente },
            marca_conta: brand,
            marca_contrato: c.brand,
            ...(sandbox
              ? {
                  pagador_ficticio: true as const,
                  pagador_referencia: { tenantId: args.tenantId ?? null },
                }
              : {}),
            especieDocumento: "RECIBO",
            tipoCobranca: "NORMAL",
          }
        : null,
  };
}
