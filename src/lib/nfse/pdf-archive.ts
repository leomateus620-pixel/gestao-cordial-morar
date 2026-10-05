/** Regras puras do arquivamento do PDF da NFS-e (testáveis, sem servidor). */
export const NFSE_PDF_MAX_BYTES = 10 * 1024 * 1024;

export function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

export function nfsePdfFileName(input: {
  numero?: string | null;
  brand: string;
  competencia: string;
}): string {
  const brand = input.brand === "morar" ? "Morar" : "Cordial";
  const [y, m] = input.competencia.slice(0, 7).split("-");
  const comp = y && m ? `${m}-${y}` : input.competencia;
  const numero = (input.numero ?? "").replace(/[^\w-]/g, "") || "sem-numero";
  return `NFS-e ${numero} - ${brand} - ${comp}.pdf`;
}

export function nfsePdfPath(contractId: string, emissionId: string): string {
  return `${contractId}/nfse/${emissionId}.pdf`;
}

/** Só nota real emitida, com link oficial e ainda sem PDF salvo. */
export function shouldArchivePdf(row: {
  status: string;
  modo_teste: boolean;
  link_pdf: string | null;
  pdf_document_id: string | null;
}): boolean {
  return row.status === "emitida" && !row.modo_teste && !!row.link_pdf && !row.pdf_document_id;
}
