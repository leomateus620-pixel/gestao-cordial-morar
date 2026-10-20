import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { emptyMeters } from "./model.ts";
import { buildInspectionPdf, PdfPhotoError, pdfSafe, wrapText, type PdfModel } from "./pdf.ts";

import { pngOf } from "../../../tests/vistoria/png";

const longWord = "https://exemplo.com.br/" + "caminho-muito-longo-".repeat(20);
const model = (draft: boolean): PdfModel => ({
  brand: "cordial",
  numero: 42,
  kind: "entrada",
  statusLabel: draft ? "Em revisão" : "Concluída",
  version: draft ? null : 1,
  draft,
  generatedAt: "2026-10-20T10:00:00Z",
  property: {
    codes: "Cordial 1409 · Morar 3408",
    tipo: "Apartamento",
    endereco: "Rua Ação Ñandú, 100 · Centro · Santa Rosa/RS",
  },
  responsible: "João Conceição",
  inspectedAt: "2026-10-20T09:30:00-03:00",
  participants: [{ nome: "Inquilina Açucena", papel: "Locatária" }],
  furnished: "Não",
  cleaning: "Limpo",
  keys: [{ descricao: "Chave da porta “principal”", quantidade: 2 }],
  meters: {
    ...emptyMeters(),
    agua: { status: "informado", reading: "00123" },
    gas: { status: "nao_aplicavel" },
  },
  generalNotes: `Observação com acentuação: ção, ã, é, ü — e emoji 🙂. ${longWord}`,
  conclusion: "Imóvel entregue conforme relatado.",
  rooms: Array.from({ length: 6 }, (_, r) => ({
    name: `Dormitório ${r + 1} — piso de madeira`,
    noPhotoReason: null,
    items: Array.from({ length: 10 }, (_, i) => ({
      id: `i${r}-${i}`,
      name: `Item ${i} parede`,
      state:
        i % 3 === 0 ? ("ruim" as const) : i % 3 === 1 ? ("nao_testado" as const) : ("bom" as const),
      quantity: i,
      material: "Cerâmica",
      color: "Branco gelo",
      notes: "Texto longo ".repeat(30),
      damage: i % 3 === 0 ? "Trinca de 10 cm próxima à janela" : null,
      untested_reason: i % 3 === 1 ? "Sem energia elétrica" : null,
    })),
    notes: [{ text: "Relato revisado com ç e ã.", kind: "aprovado" as const }],
    photos: [
      {
        path: `p${r}-v`,
        caption: "Vertical",
        takenAt: "2026-10-20T12:00:00Z",
        timeSource: "captura" as const,
        itemId: `i${r}-0`,
      },
      {
        path: `p${r}-h`,
        caption: "Horizontal",
        takenAt: "2026-10-20T12:00:00Z",
        timeSource: "importacao" as const,
        itemId: null,
      },
      {
        path: `p${r}-x`,
        caption: null,
        takenAt: null,
        timeSource: "importacao" as const,
        itemId: null,
      },
    ],
  })),
});

test("pdfSafe mantém acentos do português e preserva símbolos sem glifo como códigos Unicode", () => {
  assert.equal(pdfSafe("ação “x” — 🙂"), 'ação "x" - [U+1F642]');
});

test("wrapText quebra palavras maiores que a largura", async () => {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const lines = wrapText(longWord, f, 10, 200);
  assert.ok(lines.length > 3);
  for (const l of lines) assert.ok(f.widthOfTextAtSize(l, 10) <= 200);
});

test("PDF final com textos longos, acentos e fotos vertical/horizontal abre e tem páginas", async () => {
  const vertical = await pngOf(60, 120);
  const horizontal = await pngOf(160, 80);
  const bytes = await buildInspectionPdf(model(false), async (p) => ({
    bytes: p.endsWith("v") ? vertical : horizontal,
    mime: "image/png",
  }));
  const loaded = await PDFDocument.load(bytes);
  assert.ok(loaded.getPageCount() >= 4);
  mkdirSync("/tmp/vistoria", { recursive: true });
  writeFileSync("/tmp/vistoria/laudo-final.pdf", bytes);
});

test("PDF final é bloqueado se alguma foto falhar; rascunho mostra placeholder", async () => {
  const ok = await pngOf(40, 40);
  const loader = async (p: string) => {
    if (p === "p2-x") throw new Error("download falhou");
    return { bytes: ok, mime: "image/png" };
  };
  await assert.rejects(
    buildInspectionPdf(model(false), loader),
    (e) => e instanceof PdfPhotoError && e.failed.length === 1 && e.failed[0].number === 9,
  );
  const draft = await buildInspectionPdf(model(true), loader);
  assert.ok((await PDFDocument.load(draft)).getPageCount() >= 4);
  writeFileSync("/tmp/vistoria/laudo-rascunho.pdf", draft);
});
test("mesmo snapshot e imagens geram exatamente os mesmos bytes na retomada", async () => {
  const fixture = model(false);
  fixture.rooms = fixture.rooms.slice(0, 1);
  const image = await pngOf(60, 120);
  const loader = async () => ({ bytes: image, mime: "image/png" });
  const first = await buildInspectionPdf(fixture, loader);
  const retry = await buildInspectionPdf(fixture, loader);
  assert.deepEqual(retry, first);
});

test("todas as colunas, legendas extensas e assinaturas ficam nas margens", async () => {
  const { PDFPage } = await import("pdf-lib");
  const original = PDFPage.prototype.drawText,
    drawImage = PDFPage.prototype.drawImage;
  const texts: string[] = [];
  const failures: string[] = [];
  PDFPage.prototype.drawText = function (text, options) {
    texts.push(text);
    const x = options?.x ?? 0,
      y = options?.y ?? 0,
      size = options?.size ?? 10,
      f = options?.font;
    if (y < 29 || x < 41 || (f && x + f.widthOfTextAtSize(text, size) > 554)) failures.push(text);
    return original.call(this, text, options);
  };
  PDFPage.prototype.drawImage = function (image, options) {
    if ((options?.y ?? 0) < 69) failures.push("imagem ultrapassou a margem");
    return drawImage.call(this, image, options);
  };
  try {
    const fixture = model(false);
    fixture.rooms = fixture.rooms.slice(0, 2);
    fixture.rooms[0].photos.reverse();
    fixture.rooms[0].photos[1].caption =
      "Legenda muito extensa: " + "observação integral ".repeat(250);
    fixture.participants = [
      { nome: "Pessoa de demonstração ".repeat(6) + "FINAL_DO_NOME", papel: "Acompanhante" },
    ];
    const vertical = await pngOf(30, 100),
      horizontal = await pngOf(150, 50);
    await buildInspectionPdf(fixture, async (p) => ({
      bytes: p.endsWith("v") ? vertical : horizontal,
      mime: "image/png",
    }));
    assert.deepEqual(failures, []);
    assert.ok(texts.some((t) => t.includes("continuação")));
    assert.ok(texts.some((t) => t.includes("FINAL_DO_NOME")));
    assert.ok(texts.join(" ").includes("Legenda muito extensa"));
  } finally {
    PDFPage.prototype.drawText = original;
    PDFPage.prototype.drawImage = drawImage;
  }
});
