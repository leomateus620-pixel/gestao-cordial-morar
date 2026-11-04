import { z } from "zod";
import { computeReceiptTotals, MAX_ADJUSTMENT_DESCRIPTION, MAX_ADJUSTMENTS_PER_SIDE, validateReceiptAdjustments } from "./receipt-model";

const money = z.number().finite().min(0).max(99999999);
const kind = z.enum(["desconto", "acrescimo"]);
const text = z.string().max(MAX_ADJUSTMENT_DESCRIPTION);
export const COMPROVANTE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;
export const COMPROVANTE_MAX_BYTES = 5 * 1024 * 1024;

export const receiptValoresSchema = z
  .object({
    competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    brand: z.enum(["cordial", "morar"]),
    aluguel: money,
    honorarios: money,
    condominio: money,
    iptu: money,
    iptuParcela: z.string().max(20),
    seguroFianca: money,
    observacao: z.string().max(160),
    vencimento: z.string().max(10),
    totalPagar: z.number().finite(),
    totalReceber: z.number().finite(),
    ajustesInquilino: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            tipo: kind,
            descricao: text,
            valor: z.number().finite(),
            repassarProprietario: z.boolean(),
            recorrenteId: z.string().uuid().optional(),
          })
          .strict(),
      )
      .max(MAX_ADJUSTMENTS_PER_SIDE)
      .optional(),
    ajustesProprietario: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            tipo: kind,
            descricao: text,
            valor: z.number().finite(),
            comprovantePath: z.string().max(240).optional(),
          })
          .strict(),
      )
      .max(MAX_ADJUSTMENTS_PER_SIDE)
      .optional(),
  })
  .strict();
export type ReceiptValores = z.infer<typeof receiptValoresSchema>;

export function comprovantePrefix(contractId: string, competencia: string) {
  return `${contractId}/recibos/comprovantes/${competencia}-`;
}
export function isValidComprovantePath(path: string, contractId: string, competencia: string) {
  const prefix = comprovantePrefix(contractId, competencia);
  if (!path.startsWith(prefix) || path.includes("..")) return false;
  return /^\d+-[a-f0-9-]+\.(pdf|jpg|jpeg|png)$/.test(path.slice(prefix.length));
}

/** Server-side check: never trust client totals or attachment paths. */
export function checkReceiptValores(contractId: string, competencia: string, raw: unknown) {
  const valores = receiptValoresSchema.parse(raw);
  if (valores.competencia !== competencia) throw new Error("Competência divergente.");
  validateReceiptAdjustments(valores);
  const totals = computeReceiptTotals(valores);
  if (totals.totalPagar < 0 || totals.totalReceber < 0)
    throw new Error("Os descontos não podem deixar o total negativo.");
  if (
    Math.round(totals.totalPagar * 100) !== Math.round(valores.totalPagar * 100) ||
    Math.round(totals.totalReceber * 100) !== Math.round(valores.totalReceber * 100)
  )
    throw new Error("Os totais do recibo não conferem. Revise os valores.");
  for (const a of valores.ajustesProprietario ?? [])
    if (a.comprovantePath && !isValidComprovantePath(a.comprovantePath, contractId, competencia))
      throw new Error("Comprovante inválido.");
  return { ...valores, totalPagar: totals.totalPagar, totalReceber: totals.totalReceber };
}
