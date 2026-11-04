import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkReceiptValores, COMPROVANTE_MAX_BYTES } from "./receipt-registration";
import type { RecurringAdjustment } from "./receipt-model";

const scope = z.object({
  contractId: z.string().uuid(),
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
export const listRentalEmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof scope>) => scope.parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rental_emissions")
      .select("*")
      .eq("contract_id", data.contractId)
      .eq("competencia", data.competencia)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os arquivos.");
    return rows ?? [];
  });
export const getReceiptCompanyTaxId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { brand: "cordial" | "morar" }) =>
    z.object({ brand: z.enum(["cordial", "morar"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("nfse_provider_settings")
      .select("cnpj")
      .eq("brand", data.brand)
      .maybeSingle();
    return row?.cnpj ?? null;
  });
const receiptRegistration = scope.extend({
  filePath: z.string().max(240),
  fileName: z.string().min(1).max(150),
  valores: z.unknown(),
});
export const registerRentalReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof receiptRegistration>) => receiptRegistration.parse(data))
  .handler(async ({ data, context }) => {
    const prefix = `${data.contractId}/recibos/${data.competencia}-`;
    if (
      !data.filePath.startsWith(prefix) ||
      !/^\d+-[a-f0-9-]+\.pdf$/.test(data.filePath.slice(prefix.length))
    )
      throw new Error("Arquivo inválido.");
    const valores = checkReceiptValores(data.contractId, data.competencia, data.valores);
    const { data: contract } = await context.supabase
      .from("rental_contracts")
      .select("id")
      .eq("id", data.contractId)
      .maybeSingle();
    if (!contract) throw new Error("Aluguel indisponível.");
    const { data: existing } = await context.supabase
      .from("rental_emissions")
      .select("id")
      .eq("contract_id", data.contractId)
      .eq("tipo", "recibo")
      .eq("file_path", data.filePath)
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
    const { data: file, error: downloadError } = await context.supabase.storage
      .from("rental-documents")
      .download(data.filePath);
    if (
      downloadError ||
      !file ||
      file.size > 5 * 1024 * 1024 ||
      (await file.slice(0, 5).text()) !== "%PDF-"
    )
      throw new Error("PDF não encontrado ou inválido.");
    for (const a of valores.ajustesProprietario ?? []) {
      if (!a.comprovantePath) continue;
      const { data: proof, error: proofError } = await context.supabase.storage
        .from("rental-documents")
        .download(a.comprovantePath);
      if (proofError || !proof || proof.size > COMPROVANTE_MAX_BYTES)
        throw new Error("Comprovante não encontrado ou muito grande.");
    }
    const { data: row, error } = await context.supabase
      .from("rental_emissions")
      .insert({
        contract_id: data.contractId,
        tipo: "recibo",
        competencia: data.competencia,
        file_path: data.filePath,
        file_name: data.fileName,
        valores: JSON.parse(JSON.stringify(valores)),
        created_by: context.userId,
        provider: "gestao",
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        "O arquivo foi enviado, mas não foi possível registrar o recibo. Tente novamente.",
      );
    return row;
  });
export const getRentalEmissionUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("rental_emissions")
      .select("file_path,external_url,contract_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Arquivo indisponível.");
    if (!row.file_path) {
      if (row.external_url) {
        const external = new URL(row.external_url);
        if (external.protocol === "https:" && !external.username && !external.password)
          return external.href;
      }
      throw new Error("Arquivo indisponível.");
    }
    if (!row.file_path.startsWith(`${row.contract_id}/`) || row.file_path.includes(".."))
      throw new Error("Arquivo indisponível.");
    const { data: signed, error } = await context.supabase.storage
      .from("rental-documents")
      .createSignedUrl(row.file_path, 604800);
    if (error || !signed) throw new Error("Não foi possível abrir o arquivo.");
    return signed.signedUrl;
  });

const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const listContractAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { contractId: string }) =>
    z.object({ contractId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<RecurringAdjustment[]> => {
    const { data: rows, error } = await context.supabase
      .from("rental_contract_adjustments")
      .select("id,tipo,descricao,valor,repassar_proprietario,inicio_competencia,fim_competencia,ativo")
      .eq("contract_id", data.contractId)
      .eq("ativo", true)
      .order("created_at");
    if (error) throw new Error("Não foi possível carregar os ajustes recorrentes.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      tipo: r.tipo === "acrescimo" ? "acrescimo" : "desconto",
      descricao: r.descricao,
      valor: Number(r.valor),
      repassarProprietario: r.repassar_proprietario,
      inicioCompetencia: r.inicio_competencia,
      fimCompetencia: r.fim_competencia,
      ativo: r.ativo,
    }));
  });
const adjustmentInput = z.object({
  id: z.string().uuid().optional(),
  contractId: z.string().uuid(),
  tipo: z.enum(["desconto", "acrescimo"]),
  descricao: z.string().trim().min(1).max(120),
  valor: z.number().finite().gt(0).max(99999999),
  repassarProprietario: z.boolean(),
  inicioCompetencia: competence,
  fimCompetencia: competence.nullable(),
});
export const upsertContractAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof adjustmentInput>) => adjustmentInput.parse(data))
  .handler(async ({ data, context }) => {
    if (data.fimCompetencia && data.fimCompetencia < data.inicioCompetencia)
      throw new Error("A repetição não pode terminar antes do início.");
    const row = {
      contract_id: data.contractId,
      tipo: data.tipo,
      descricao: data.descricao,
      valor: data.valor,
      repassar_proprietario: data.repassarProprietario,
      inicio_competencia: data.inicioCompetencia,
      fim_competencia: data.fimCompetencia,
    };
    const query = data.id
      ? context.supabase
          .from("rental_contract_adjustments")
          .update(row)
          .eq("id", data.id)
          .eq("contract_id", data.contractId)
      : context.supabase
          .from("rental_contract_adjustments")
          .insert({ ...row, created_by: context.userId });
    const { data: saved, error } = await query.select("id").single();
    if (error || !saved) throw new Error("Não foi possível salvar o ajuste recorrente.");
    return saved;
  });
export const deactivateContractAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; contractId: string }) =>
    z.object({ id: z.string().uuid(), contractId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rental_contract_adjustments")
      .update({ ativo: false })
      .eq("id", data.id)
      .eq("contract_id", data.contractId);
    if (error) throw new Error("Não foi possível encerrar o ajuste recorrente.");
    return { ok: true };
  });
