import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  valores: z.record(
    z.union([z.string().max(200), z.number().finite().min(-999999999).max(999999999)]),
  ),
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
    const { data: row, error } = await context.supabase
      .from("rental_emissions")
      .insert({
        contract_id: data.contractId,
        tipo: "recibo",
        competencia: data.competencia,
        file_path: data.filePath,
        file_name: data.fileName,
        valores: data.valores,
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
