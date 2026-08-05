import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFileSize,
  sanitizeInternalFileName,
  validateInternalDocumentFile,
} from "./internal-document.ts";

test("formatFileSize formata unidades", () => {
  assert.equal(formatFileSize(null), "—");
  assert.equal(formatFileSize(500), "500 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
});

test("validateInternalDocumentFile rejeita vazio e acima de 50 MB", () => {
  assert.match(validateInternalDocumentFile({ name: "a.pdf", size: 0 })!, /vazio/);
  assert.match(
    validateInternalDocumentFile({ name: "a.pdf", size: 51 * 1024 * 1024 })!,
    /50 MB/,
  );
  assert.equal(validateInternalDocumentFile({ name: "a.pdf", size: 1024 }), null);
});

test("sanitizeInternalFileName remove caracteres inseguros", () => {
  assert.equal(sanitizeInternalFileName("Contrato final (1).pdf"), "Contrato_final_1_.pdf");
});
