import { safeNfseDocumentUrl } from "./ipm/response";
import { buildNfseReceiptPdf } from "./pdf-receipt";
import {
  NFSE_PDF_MAX_BYTES,
  isPdfBytes,
  nfsePdfFileName,
  nfsePdfPath,
  shouldArchivePdf,
} from "./pdf-archive";

const BUCKET = "rental-documents";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type PdfArchiveResult = { status: "salvo" | "falhou" | "nao_aplicavel"; error?: string };

/**
 * Baixa o PDF oficial da nota emitida e guarda no aluguel (categoria nota_fiscal).
 * Idempotente: nota com PDF salvo não é processada de novo. Nunca altera dados fiscais.
 */
export async function archiveNfsePdf(admin: Admin, emissionId: string): Promise<PdfArchiveResult> {
  const { data: row, error } = await admin
    .from("rental_nfse_emissions")
    .select(
      "id,contract_id,brand,competencia,status,modo_teste,numero_nfse,serie_nfse,codigo_verificador,data_emissao_nfse,valor,snapshot,link_pdf,pdf_document_id,pdf_attempts",
    )
    .eq("id", emissionId)
    .maybeSingle();
  if (error || !row) return { status: "falhou", error: "Nota não encontrada." };
  if (row.pdf_document_id) return { status: "salvo" };
  if (!shouldArchivePdf(row)) return { status: "nao_aplicavel" };

  const fail = async (message: string): Promise<PdfArchiveResult> => {
    await admin
      .from("rental_nfse_emissions")
      .update({
        pdf_status: "falhou",
        pdf_last_error: message.slice(0, 500),
        pdf_attempts: (row.pdf_attempts ?? 0) + 1,
      })
      .eq("id", row.id)
      .is("pdf_document_id", null);
    return { status: "falhou", error: message };
  };

  const url = safeNfseDocumentUrl(row.link_pdf);
  if (!url) return fail("Link do PDF fora do endereço oficial da prefeitura.");

  // O link oficial costuma abrir a página de autenticidade (HTML). Se vier PDF, guarda o original;
  // senão gera o comprovante com os dados devolvidos pela prefeitura e o link de autenticidade.
  let bytes: Uint8Array | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (response.ok) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength <= NFSE_PDF_MAX_BYTES && isPdfBytes(buffer)) bytes = buffer;
    }
  } catch {
    bytes = null;
  }
  if (!bytes) {
    try {
      bytes = await buildNfseReceiptPdf(receiptFromRow(row, url));
    } catch {
      return fail("Não foi possível gerar o PDF da nota.");
    }
  }

  const path = nfsePdfPath(row.contract_id, row.id);
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) return fail("Não foi possível guardar o PDF.");

  const { data: existing } = await admin
    .from("rental_contract_documents")
    .select("id")
    .eq("contract_id", row.contract_id)
    .eq("file_path", path)
    .maybeSingle();
  let docId: string | undefined = existing?.id;
  if (!docId) {
    const ins = await admin
      .from("rental_contract_documents")
      .insert({
        contract_id: row.contract_id,
        file_path: path,
        file_name: nfsePdfFileName({
          numero: row.numero_nfse,
          brand: row.brand,
          competencia: row.competencia,
        }),
        mime_type: "application/pdf",
        size_bytes: bytes.byteLength,
        category: "nota_fiscal",
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) return fail("Não foi possível registrar o PDF no aluguel.");
    docId = ins.data.id;
  }
  await admin
    .from("rental_nfse_emissions")
    .update({ pdf_document_id: docId, pdf_status: "salvo", pdf_last_error: null })
    .eq("id", row.id)
    .is("pdf_document_id", null);
  return { status: "salvo" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function receiptFromRow(row: any, link: string | null) {
  const snap = row.snapshot ?? {};
  const fs = snap.fiscalSettings ?? {};
  const t = snap.review?.tomador ?? {};
  return {
    modoTeste: !!row.modo_teste,
    numero: row.numero_nfse ?? null,
    serie: row.serie_nfse ?? null,
    dataEmissao: row.data_emissao_nfse ?? null,
    codigoVerificador: row.codigo_verificador ?? null,
    linkConsulta: link,
    prestadorNome: String(fs.razao_social ?? (row.brand === "morar" ? "Morar" : "Cordial")),
    prestadorCnpj: String(fs.cnpj ?? ""),
    tomadorNome: String(t.nome ?? ""),
    tomadorDocumento: String(t.documento ?? ""),
    tomadorEndereco: [t.logradouro, t.numero, t.bairro, t.cep ? `CEP ${t.cep}` : null, t.cidadeTom ? `Município (TOM) ${t.cidadeTom}` : null]
      .filter(Boolean)
      .join(", "),
    descricao: String(snap.profile?.descricao ?? "Comissão de administração de aluguel"),
    competencia: String(row.competencia),
    valor: Number(row.valor),
    itemServico: String(fs.codigo_item_lista_servico ?? ""),
    imovel: snap.propertyLabel ?? null,
  };
}
