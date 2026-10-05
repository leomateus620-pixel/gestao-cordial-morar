import assert from "node:assert/strict";
import test from "node:test";
import { isPdfBytes, nfsePdfFileName, nfsePdfPath, shouldArchivePdf } from "./pdf-archive";

test("reconhece PDF pela assinatura", () => {
  assert.equal(isPdfBytes(new TextEncoder().encode("%PDF-1.7 x")), true);
  assert.equal(isPdfBytes(new TextEncoder().encode("<html>")), false);
});
test("nome e caminho do arquivo", () => {
  assert.equal(
    nfsePdfFileName({ numero: "123", brand: "cordial", competencia: "2026-09" }),
    "NFS-e 123 - Cordial - 09-2026.pdf",
  );
  assert.equal(nfsePdfPath("c", "e"), "c/nfse/e.pdf");
});
test("só arquiva nota real emitida sem PDF salvo (idempotente)", () => {
  const base = { status: "emitida", modo_teste: false, link_pdf: "https://santarosa.atende.net/x", pdf_document_id: null };
  assert.equal(shouldArchivePdf(base), true);
  assert.equal(shouldArchivePdf({ ...base, modo_teste: true }), false);
  assert.equal(shouldArchivePdf({ ...base, status: "teste_ok" }), false);
  assert.equal(shouldArchivePdf({ ...base, pdf_document_id: "d" }), false);
  assert.equal(shouldArchivePdf({ ...base, link_pdf: null }), false);
});
