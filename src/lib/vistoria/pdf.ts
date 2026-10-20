import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { ITEM_STATE_LABEL, KIND_LABEL, METER_LABEL, meterText, type InspectionKind, type ItemState, type Meters } from "./model";

export type PdfPhoto = { path: string; caption: string | null; takenAt: string | null; timeSource: "captura" | "importacao"; itemId: string | null };
export type PdfItem = {
  id: string;
  name: string;
  state: ItemState;
  quantity: number | null;
  material: string | null;
  color: string | null;
  notes: string | null;
  damage: string | null;
  untested_reason: string | null;
};
export type PdfRoom = {
  name: string;
  noPhotoReason: string | null;
  items: PdfItem[];
  notes: Array<{ text: string; kind: "aprovado" | "transcricao_nao_revisada" }>;
  photos: PdfPhoto[];
};
export type PdfModel = {
  brand: "cordial" | "morar";
  numero: number;
  kind: InspectionKind;
  statusLabel: string;
  version: number | null;
  draft: boolean;
  generatedAt: string;
  property: { codes: string; tipo: string; endereco: string };
  responsible: string;
  inspectedAt: string | null;
  participants: Array<{ nome: string; papel: string }>;
  furnished: string;
  cleaning: string;
  keys: Array<{ descricao: string; quantidade: number }>;
  meters: Meters;
  generalNotes: string | null;
  conclusion: string | null;
  rooms: PdfRoom[];
};
export type ImageLoader = (path: string) => Promise<{ bytes: Uint8Array; mime: string }>;

export class PdfPhotoError extends Error {
  constructor(public failed: Array<{ number: number; room: string; path: string; reason: string }>) {
    super(`${failed.length} foto(s) não puderam ser carregadas para o laudo final.`);
  }
}

const BRAND = {
  cordial: { name: "Cordial Imóveis", color: rgb(0.06, 0.29, 0.33) },
  morar: { name: "Morar Imóveis", color: rgb(0.55, 0.22, 0.12) },
};
const A4 = { w: 595.28, h: 841.89 };
const M = 42;
const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.42, 0.44, 0.48);

/** Fontes padrão do PDF usam WinAnsi: acentos do português funcionam; outros símbolos viram equivalentes. */
export function pdfSafe(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[^\n\x20-\x7E\u00A1-\u00FF\u20AC]/gu, (ch) => {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return /^[\x20-\x7E]$/.test(base) ? base : "?";
    });
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      // Palavras longas (URLs, códigos) são quebradas por caractere para não cortar.
      while (font.widthOfTextAtSize(w, size) > width) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const cand = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) > width) {
        out.push(line);
        line = w;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "Não informado";

export async function buildInspectionPdf(model: PdfModel, loadImage: ImageLoader): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`Laudo de vistoria nº ${model.numero}`));
  pdf.setProducer("Gestão Cordial");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = BRAND[model.brand];
  const contentW = A4.w - M * 2;
  const top = A4.h - M - 34;
  const bottom = M + 28;

  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: brand.color });
    page.drawText(pdfSafe(brand.name), { x: M, y: A4.h - M + 6, size: 10, font: bold, color: brand.color });
    const right = pdfSafe(`Vistoria nº ${model.numero} · ${KIND_LABEL[model.kind]}${model.version ? ` · v${model.version}` : ""}`);
    page.drawText(right, { x: A4.w - M - font.widthOfTextAtSize(right, 9), y: A4.h - M + 6, size: 9, font, color: MUTED });
    if (model.draft) {
      page.drawText("RASCUNHO - SEM VALOR DE LAUDO FINAL", { x: M, y: A4.h - M - 8, size: 9, font: bold, color: rgb(0.75, 0.2, 0.15) });
    }
    y = top;
  };
  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };
  const para = (t: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    const indent = opts.indent ?? 0;
    const lh = size * 1.35;
    for (const line of wrapText(t, f, size, contentW - indent)) {
      ensure(lh);
      page.drawText(line, { x: M + indent, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= lh;
    }
    y -= opts.gap ?? 2;
  };
  const heading = (t: string) => {
    ensure(40);
    y -= 8;
    para(t, { size: 13, f: bold, color: brand.color, gap: 4 });
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4.w - M, y: y + 2 }, thickness: 0.6, color: brand.color });
    y -= 6;
  };
  const kv = (k: string, v: string) => para(`${k}: ${v || "Não informado"}`);

  newPage();
  para(`Laudo de vistoria - ${KIND_LABEL[model.kind]}`, { size: 18, f: bold, gap: 4 });
  para(`Nº ${model.numero} · Status: ${model.statusLabel}${model.version ? ` · Versão ${model.version}` : " · Sem versão emitida"}`, { color: MUTED });
  para(`Gerado em ${fmtDate(model.generatedAt)}`, { color: MUTED, gap: 8 });

  heading("Identificação do imóvel");
  kv("Códigos", model.property.codes);
  kv("Tipo", model.property.tipo);
  kv("Endereço", model.property.endereco);
  heading("Vistoria");
  kv("Data e hora", fmtDate(model.inspectedAt));
  kv("Responsável", model.responsible);
  kv("Participantes", model.participants.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ""}`).join("; ") || "Nenhum informado");
  kv("Mobiliado", model.furnished);
  kv("Limpeza", model.cleaning);
  heading("Medidores e chaves");
  for (const k of Object.keys(METER_LABEL) as Array<keyof Meters>) {
    const m = model.meters[k];
    kv(METER_LABEL[k], `${meterText(m)}${m?.number ? ` · medidor ${m.number}` : ""}`);
  }
  kv("Chaves e controles", model.keys.map((k) => `${k.quantidade}x ${k.descricao}`).join("; ") || "Não informado");

  // Numeração global das fotos e referência a avarias
  let n = 0;
  const photoNumbers = new Map<string, number>();
  for (const r of model.rooms) for (const p of r.photos) photoNumbers.set(p.path, ++n);

  heading("Resumo");
  const allItems = model.rooms.flatMap((r) => r.items);
  const count = (s: ItemState) => allItems.filter((i) => i.state === s).length;
  para(
    `${model.rooms.length} ambientes · ${allItems.length} itens · Bom ${count("bom")} · Regular ${count("regular")} · Ruim ${count("ruim")} · Não testado ${count("nao_testado")} · Não se aplica ${count("nao_se_aplica")} · Pendente ${count("pendente")} · ${n} fotos`,
  );
  if (model.generalNotes) para(`Observações gerais: ${model.generalNotes}`);

  heading("Ambientes e itens");
  for (const r of model.rooms) {
    ensure(50);
    para(r.name, { size: 12, f: bold, gap: 2 });
    if (!r.items.length) para("Sem itens cadastrados.", { color: MUTED, indent: 8 });
    for (const i of r.items) {
      const refs = r.photos.filter((p) => p.itemId === i.id).map((p) => `foto ${photoNumbers.get(p.path)}`);
      para(`${i.name} - ${ITEM_STATE_LABEL[i.state]}${i.quantity != null ? ` · qtd. ${i.quantity}` : ""}`, { f: bold, size: 10, indent: 8, gap: 0 });
      const details = [
        i.material && `Material: ${i.material}`,
        i.color && `Cor: ${i.color}`,
        i.notes && `Observação: ${i.notes}`,
        i.damage && `Avaria: ${i.damage}`,
        i.state === "nao_testado" && `Motivo de não testar: ${i.untested_reason || "não informado"}`,
        refs.length ? `Ver ${refs.join(", ")}` : null,
      ].filter(Boolean) as string[];
      for (const d of details) para(d, { size: 9.5, indent: 18, gap: 0 });
      y -= 3;
    }
    for (const note of r.notes)
      para(`${note.kind === "aprovado" ? "Relato revisado" : "Transcrição ainda não revisada"}: ${note.text}`, { size: 9.5, indent: 8, color: note.kind === "aprovado" ? INK : MUTED });
    if (!r.photos.length) para(`Sem foto: ${r.noPhotoReason || "motivo não registrado"}`, { size: 9.5, indent: 8, color: MUTED });
    y -= 6;
  }

  heading("Registro fotográfico");
  const failed: Array<{ number: number; room: string; path: string; reason: string }> = [];
  const colW = (contentW - 12) / 2;
  const maxH = 210;
  for (const r of model.rooms) {
    if (!r.photos.length) continue;
    ensure(30);
    para(r.name, { size: 11, f: bold });
    let col = 0;
    let rowH = 0;
    for (const p of r.photos) {
      const num = photoNumbers.get(p.path)!;
      let img: PDFImage | null = null;
      try {
        const { bytes, mime } = await loadImage(p.path);
        img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      } catch (e) {
        failed.push({ number: num, room: r.name, path: p.path, reason: e instanceof Error ? e.message : "falha" });
      }
      const scale = img ? Math.min(colW / img.width, maxH / img.height) : 1;
      const w = img ? img.width * scale : colW;
      const h = img ? img.height * scale : 80;
      const captionLines = wrapText(
        `Foto ${num}${p.caption ? ` - ${p.caption}` : ""} · ${p.timeSource === "captura" ? "capturada" : "importada"} em ${fmtDate(p.takenAt)}`,
        font,
        8.5,
        colW,
      );
      const blockH = h + 6 + captionLines.length * 11;
      if (col === 0) {
        ensure(blockH + 8);
        rowH = 0;
      }
      const x = M + col * (colW + 12);
      const top0 = y;
      if (img) page.drawImage(img, { x: x + (colW - w) / 2, y: top0 - h, width: w, height: h });
      else {
        page.drawRectangle({ x, y: top0 - h, width: colW, height: h, borderColor: rgb(0.75, 0.2, 0.15), borderWidth: 1 });
        page.drawText(pdfSafe(`Foto ${num} indisponível - gerar novamente`), { x: x + 8, y: top0 - h / 2, size: 9, font: bold, color: rgb(0.75, 0.2, 0.15) });
      }
      captionLines.forEach((l, li) => page.drawText(l, { x, y: top0 - h - 12 - li * 11, size: 8.5, font, color: MUTED }));
      rowH = Math.max(rowH, blockH);
      img = null; // libera referência cedo (memória no celular)
      if (col === 1) {
        y -= rowH + 10;
        col = 0;
      } else col = 1;
    }
    if (col === 1) y -= rowH + 10;
  }
  if (!model.draft && failed.length) throw new PdfPhotoError(failed);

  heading("Conclusão");
  para(model.conclusion || "Sem conclusão registrada.");
  ensure(150);
  y -= 10;
  para(
    "Este documento registra o estado observado na data indicada. Ele não constitui assinatura digital nem tem validade jurídica automática; as assinaturas abaixo são manuais.",
    { size: 8.5, color: MUTED, gap: 18 },
  );
  const signers = [{ nome: model.responsible, papel: "Vistoriador(a)" }, ...model.participants];
  for (let i = 0; i < signers.length; i += 2) {
    ensure(60);
    for (let c = 0; c < 2 && i + c < signers.length; c++) {
      const s = signers[i + c];
      const x = M + c * (contentW / 2 + 6);
      page.drawLine({ start: { x, y: y - 30 }, end: { x: x + contentW / 2 - 18, y: y - 30 }, thickness: 0.6, color: INK });
      page.drawText(pdfSafe(`${s.nome}${s.papel ? ` - ${s.papel}` : ""}`).slice(0, 70), { x, y: y - 42, size: 8.5, font, color: MUTED });
    }
    y -= 60;
  }

  const pages = pdf.getPages();
  pages.forEach((pg, idx) => {
    const t = pdfSafe(`Página ${idx + 1} de ${pages.length}`);
    pg.drawText(t, { x: A4.w - M - font.widthOfTextAtSize(t, 8), y: M - 10, size: 8, font, color: MUTED });
    pg.drawText(pdfSafe(`${brand.name} · Laudo nº ${model.numero}${model.draft ? " · RASCUNHO" : ""}`), { x: M, y: M - 10, size: 8, font, color: MUTED });
  });
  return pdf.save();
}
