import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildInspectionPdf, PdfPhotoError, pdfSafe, wrapText, type PdfModel } from "./pdf.ts";
import { emptyMeters } from "./model.ts";

// JPEG mínimos (gerados via pdf-lib-compatíveis): usamos PNG 1x1 escalado em proporções diferentes.
async function pngOf(w: number, h: number): Promise<Uint8Array> {
  // PNG sólido gerado com zlib nativo
  const { deflateSync } = await import("node:zlib");
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set([40 + (x % 200), 90, 120 + (y % 100)], y * (w * 3 + 1) + 1 + x * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
  );
}

const longWord = "https://exemplo.com.br/" + "caminho-muito-longo-".repeat(20);
const model = (draft: boolean): PdfModel => ({
  brand: "cordial",
  numero: 42,
  kind: "entrada",
  statusLabel: draft ? "Em revisão" : "Concluída",
  version: draft ? null : 1,
  draft,
  generatedAt: "2026-10-20T10:00:00Z",
  property: { codes: "Cordial 1409 · Morar 3408", tipo: "Apartamento", endereco: "Rua Ação Ñandú, 100 · Centro · Santa Rosa/RS" },
  responsible: "João Conceição",
  inspectedAt: "2026-10-20T09:30:00-03:00",
  participants: [{ nome: "Inquilina Açucena", papel: "Locatária" }],
  furnished: "Não",
  cleaning: "Limpo",
  keys: [{ descricao: "Chave da porta “principal”", quantidade: 2 }],
  meters: { ...emptyMeters(), agua: { status: "informado", reading: "00123" }, gas: { status: "nao_aplicavel" } },
  generalNotes: `Observação com acentuação: ção, ã, é, ü — e emoji 🙂. ${longWord}`,
  conclusion: "Imóvel entregue conforme relatado.",
  rooms: Array.from({ length: 6 }, (_, r) => ({
    name: `Dormitório ${r + 1} — piso de madeira`,
    noPhotoReason: null,
    items: Array.from({ length: 10 }, (_, i) => ({
      id: `i${r}-${i}`,
      name: `Item ${i} parede`,
      state: i % 3 === 0 ? ("ruim" as const) : i % 3 === 1 ? ("nao_testado" as const) : ("bom" as const),
      quantity: i,
      material: "Cerâmica",
      color: "Branco gelo",
      notes: "Texto longo ".repeat(30),
      damage: i % 3 === 0 ? "Trinca de 10 cm próxima à janela" : null,
      untested_reason: i % 3 === 1 ? "Sem energia elétrica" : null,
    })),
    notes: [{ text: "Relato revisado com ç e ã.", kind: "aprovado" as const }],
    photos: [
      { path: `p${r}-v`, caption: "Vertical", takenAt: "2026-10-20T12:00:00Z", timeSource: "captura" as const, itemId: `i${r}-0` },
      { path: `p${r}-h`, caption: "Horizontal", takenAt: "2026-10-20T12:00:00Z", timeSource: "importacao" as const, itemId: null },
      { path: `p${r}-x`, caption: null, takenAt: null, timeSource: "importacao" as const, itemId: null },
    ],
  })),
});

test("pdfSafe mantém acentos do português e substitui símbolos sem glifo", () => {
  assert.equal(pdfSafe("ação “x” — 🙂"), 'ação "x" - ?');
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
  const bytes = await buildInspectionPdf(model(false), async (p) => ({ bytes: p.endsWith("v") ? vertical : horizontal, mime: "image/png" }));
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
  await assert.rejects(buildInspectionPdf(model(false), loader), (e) => e instanceof PdfPhotoError && e.failed.length === 1 && e.failed[0].number === 9);
  const draft = await buildInspectionPdf(model(true), loader);
  assert.ok((await PDFDocument.load(draft)).getPageCount() >= 4);
  writeFileSync("/tmp/vistoria/laudo-rascunho.pdf", draft);
});
