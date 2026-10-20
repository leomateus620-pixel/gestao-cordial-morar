import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  ITEM_STATE_LABEL,
  KIND_LABEL,
  METER_LABEL,
  meterText,
  type InspectionKind,
  type ItemState,
  type Meters,
} from "./model";

export type PdfPhoto = {
  path: string;
  caption: string | null;
  takenAt: string | null;
  timeSource: "captura" | "importacao";
  itemId: string | null;
};
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
  officialVersion?: number;
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
  constructor(
    public failed: Array<{ number: number; room: string; path: string; reason: string }>,
  ) {
    super(
      `${failed.length} foto(s) não puderam ser carregadas para o laudo final: ${failed.map((f) => `foto ${f.number} (${f.room})`).join(", ")}. Tente novamente.`,
    );
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

/** WinAnsi covers Portuguese. Unsupported codepoints are preserved visibly as Unicode codes, never question marks or silently dropped. */
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
      return `[U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}]`;
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
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Não informado";

const maxPhotoBlock = 260;

export async function buildInspectionPdf(
  model: PdfModel,
  loadImage: ImageLoader,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(`Laudo de vistoria nº ${model.numero}`));
  pdf.setProducer("Gestão Cordial");
  pdf.setCreationDate(new Date(model.generatedAt));
  pdf.setModificationDate(new Date(model.generatedAt));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = BRAND[model.brand];
  const contentW = A4.w - M * 2;
  const top = A4.h - M - 34;
  const bottom = M + 28;

  let page!: PDFPage;
  let y = 0;
  let activeRoom: string | null = null;
  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: brand.color });
    page.drawText(pdfSafe(brand.name), {
      x: M,
      y: A4.h - M + 6,
      size: 10,
      font: bold,
      color: brand.color,
    });
    const right = pdfSafe(
      `Vistoria nº ${model.numero} · ${KIND_LABEL[model.kind]}${model.version ? ` · v${model.version}` : ""}`,
    );
    page.drawText(right, {
      x: A4.w - M - font.widthOfTextAtSize(right, 9),
      y: A4.h - M + 6,
      size: 9,
      font,
      color: MUTED,
    });
    if (model.draft) {
      page.drawText("RASCUNHO - SEM VALOR DE LAUDO FINAL", {
        x: M,
        y: A4.h - M - 8,
        size: 9,
        font: bold,
        color: rgb(0.75, 0.2, 0.15),
      });
    }
    y = top;
    if (activeRoom) {
      const lines = wrapText(`${activeRoom} - continuação`, bold, 11, contentW);
      for (const line of lines) {
        page.drawText(line, { x: M, y: y - 11, size: 11, font: bold, color: brand.color });
        y -= 15;
      }
      y -= 7;
    }
  };
  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };
  const para = (
    t: string,
    opts: {
      size?: number;
      f?: PDFFont;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10.5;
    const f = opts.f ?? font;
    const indent = opts.indent ?? 0;
    const lh = size * 1.35;
    const lines = wrapText(t, f, size, contentW - indent);
    if (lines.length <= 4) ensure(lines.length * lh);
    for (const [index, line] of lines.entries()) {
      ensure(lh * Math.min(2, lines.length - index));
      page.drawText(line, { x: M + indent, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= lh;
    }
    y -= opts.gap ?? 2;
  };
  const heading = (t: string) => {
    ensure(40);
    y -= 8;
    para(t, { size: 13, f: bold, color: brand.color, gap: 4 });
    page.drawLine({
      start: { x: M, y: y + 2 },
      end: { x: A4.w - M, y: y + 2 },
      thickness: 0.6,
      color: brand.color,
    });
    y -= 6;
  };
  const kv = (k: string, v: string) => para(`${k}: ${v || "Não informado"}`);

  newPage();
  para(`Laudo de vistoria - ${KIND_LABEL[model.kind]}`, { size: 18, f: bold, gap: 4 });
  para(
    model.draft
      ? "Documento: prévia não emitida"
      : `Documento: laudo oficial - versão ${model.version}`,
    { f: bold, color: model.draft ? rgb(0.65, 0.18, 0.1) : brand.color },
  );
  para(
    `Situação da vistoria: ${model.statusLabel}${model.draft && model.officialVersion ? `; laudo oficial disponível em v${model.officialVersion}` : ""}`,
    { color: MUTED },
  );
  para(`Gerado em ${fmtDate(model.generatedAt)}`, { color: MUTED, gap: 8 });

  heading("Identificação do imóvel");
  kv("Códigos", model.property.codes);
  kv("Tipo", model.property.tipo);
  kv("Endereço", model.property.endereco);
  heading("Vistoria");
  kv("Data e hora", fmtDate(model.inspectedAt));
  kv("Responsável", model.responsible);
  kv(
    "Participantes",
    model.participants.map((p) => `${p.nome}${p.papel ? ` (${p.papel})` : ""}`).join("; ") ||
      "Nenhum informado",
  );
  kv("Mobiliado", model.furnished);
  kv("Limpeza", model.cleaning);
  heading("Medidores e chaves");
  for (const k of Object.keys(METER_LABEL) as Array<keyof Meters>) {
    const m = model.meters[k];
    kv(METER_LABEL[k], `${meterText(m)}${m?.number ? ` · medidor ${m.number}` : ""}`);
  }
  kv(
    "Chaves e controles",
    model.keys.map((k) => `${k.quantidade}x ${k.descricao}`).join("; ") || "Não informado",
  );

  // Numeração global das fotos e referência a avarias
  let n = 0;
  const photoNumbers = new Map<string, number>();
  for (const r of model.rooms) for (const p of r.photos) photoNumbers.set(p.path, ++n);

  heading("Resumo");
  const allItems = model.rooms.flatMap((r) => r.items);
  const count = (s: ItemState) => allItems.filter((i) => i.state === s).length;
  para(
    `${model.rooms.length} ambientes · ${allItems.length} itens registrados · ${allItems.filter((i) => ["bom", "regular", "ruim"].includes(i.state)).length} avaliados · Bom ${count("bom")} · Regular ${count("regular")} · Ruim ${count("ruim")} · Não testado ${count("nao_testado")} · Não se aplica ${count("nao_se_aplica")} · Pendente ${count("pendente")} · ${n} fotos`,
  );
  if (model.generalNotes) para(`Observações gerais: ${model.generalNotes}`);

  // Images and their complete captions stay in the same room as the observations.
  const failed: Array<{ number: number; room: string; path: string; reason: string }> = [];
  const colW = (contentW - 14) / 2;
  const photo = async (p: PdfPhoto, r: PdfRoom, roomIndex: number) => {
    const number = photoNumbers.get(p.path)!;
    let img: PDFImage | null = null;
    try {
      const { bytes, mime } = await loadImage(p.path);
      img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch (e) {
      failed.push({
        number,
        room: r.name,
        path: p.path,
        reason: e instanceof Error ? e.message : "Falha ao carregar",
      });
    }
    const item = r.items.find((i) => i.id === p.itemId);
    const caption = `Foto F${String(number).padStart(3, "0")} · A${roomIndex + 1} ${r.name}${item ? ` · ${item.name}${item.damage ? " (avaria registrada)" : ""}` : " · Foto geral"}${p.caption ? ` - ${p.caption}` : ""} · ${p.timeSource === "captura" ? "capturada" : "importada"}${p.takenAt ? ` em ${fmtDate(p.takenAt)}` : " (data não registrada)"}`;
    return { img, caption, number };
  };
  const renderSingle = (p: Awaited<ReturnType<typeof photo>>) => {
    const scale = p.img ? Math.min(contentW / p.img.width, 235 / p.img.height) : 1;
    const h = p.img ? p.img.height * scale : 70,
      w = p.img ? p.img.width * scale : contentW;
    ensure(h + 50);
    if (p.img) page.drawImage(p.img, { x: M + (contentW - w) / 2, y: y - h, width: w, height: h });
    else
      page.drawText(`Foto F${String(p.number).padStart(3, "0")} indisponível`, {
        x: M,
        y: y - 30,
        font: bold,
        size: 11,
        color: rgb(0.7, 0.15, 0.1),
      });
    y -= h + 7;
    para(p.caption, { size: 9.5, color: MUTED, gap: 10 });
  };
  for (const [ri, r] of model.rooms.entries()) {
    activeRoom = null;
    ensure(70);
    activeRoom = `A${ri + 1} · ${r.name}`;
    heading(activeRoom);
    if (!r.items.length) para("Sem itens cadastrados.", { color: MUTED });
    for (const [ii, i] of r.items.entries()) {
      const refs = r.photos
        .filter((p) => p.itemId === i.id)
        .map((p) => `F${String(photoNumbers.get(p.path)).padStart(3, "0")}`);
      ensure(35);
      para(
        `A${ri + 1}.I${ii + 1} · ${i.name} - ${ITEM_STATE_LABEL[i.state]}${i.quantity != null ? ` · quantidade ${i.quantity}` : ""}`,
        { f: bold, size: 10.5, gap: 1 },
      );
      const characteristics = [
        i.material && `Material: ${i.material}`,
        i.color && `Cor: ${i.color}`,
      ]
        .filter(Boolean)
        .join(" · ");
      if (characteristics) para(characteristics, { size: 10, indent: 10, gap: 1 });
      for (const detail of [
        i.notes && `Observação: ${i.notes}`,
        i.damage && `Avaria: ${i.damage}`,
        i.state === "nao_testado" &&
          `Motivo de não testar: ${i.untested_reason || "não informado"}`,
        refs.length && `Evidências: ${refs.join(", ")}`,
      ].filter(Boolean) as string[])
        para(detail, { size: 10, indent: 10, gap: 1 });
      y -= 3;
    }
    for (const note of r.notes)
      para(
        `${note.kind === "aprovado" ? "Relato aprovado" : "Relato ainda não revisado"}: ${note.text}`,
        { size: 10, gap: 6 },
      );
    if (!r.photos.length)
      para(`Sem foto: ${r.noPhotoReason || "motivo não registrado"}`, { size: 10, color: MUTED });
    for (let j = 0; j < r.photos.length; j += 2) {
      const row = await Promise.all(r.photos.slice(j, j + 2).map((p) => photo(p, r, ri)));
      const measured = row.map((p) => {
        const scale = p.img ? Math.min(colW / p.img.width, 195 / p.img.height) : 1;
        const w = p.img ? p.img.width * scale : colW,
          h = p.img ? p.img.height * scale : 70;
        const lines = wrapText(p.caption, font, 9, colW);
        return { ...p, w, h, lines, height: h + 7 + lines.length * 12 };
      });
      const rowHeight = Math.max(...measured.map((p) => p.height));
      // Both columns are measured before deciding the page break. Very long
      // captions use the full width and may continue with the room heading.
      if (rowHeight > top - bottom - 55) {
        for (const p of row) renderSingle(p);
        continue;
      }
      ensure(rowHeight + 14);
      measured.forEach((p, c) => {
        const x = M + c * (colW + 14);
        if (p.img)
          page.drawImage(p.img, { x: x + (colW - p.w) / 2, y: y - p.h, width: p.w, height: p.h });
        else {
          page.drawRectangle({
            x,
            y: y - p.h,
            width: colW,
            height: p.h,
            borderWidth: 1,
            borderColor: rgb(0.7, 0.15, 0.1),
          });
          page.drawText(`Foto F${String(p.number).padStart(3, "0")} indisponível`, {
            x: x + 8,
            y: y - 35,
            font: bold,
            size: 10,
            color: rgb(0.7, 0.15, 0.1),
          });
        }
        p.lines.forEach((line, li) =>
          page.drawText(line, { x, y: y - p.h - 16 - li * 12, font, size: 9, color: MUTED }),
        );
      });
      y -= rowHeight + 14;
    }
    y -= 8;
  }
  activeRoom = null;
  if (!model.draft && failed.length) throw new PdfPhotoError(failed);
  if (/\[U\+[A-F0-9]+\]/.test(pdfSafe(JSON.stringify(model))))
    para(
      "Caracteres sem glifo na fonte são preservados como códigos Unicode [U+XXXX]. O código identifica integralmente o caractere original.",
      { size: 9, color: MUTED },
    );

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
    const col = (contentW - 16) / 2;
    const labels = signers
      .slice(i, i + 2)
      .map((s) => wrapText(`${s.nome}${s.papel ? ` - ${s.papel}` : ""}`, font, 9.5, col));
    const h = 40 + Math.max(...labels.map((l) => l.length)) * 13;
    ensure(h);
    labels.forEach((lines, c) => {
      const x = M + c * (col + 16);
      page.drawLine({
        start: { x, y: y - 26 },
        end: { x: x + col, y: y - 26 },
        thickness: 0.6,
        color: INK,
      });
      lines.forEach((line, li) =>
        page.drawText(line, { x, y: y - 40 - li * 13, size: 9.5, font, color: MUTED }),
      );
    });
    y -= h + 10;
  }

  const pages = pdf.getPages();
  pages.forEach((pg, idx) => {
    const t = pdfSafe(`Página ${idx + 1} de ${pages.length}`);
    pg.drawText(t, {
      x: A4.w - M - font.widthOfTextAtSize(t, 8),
      y: M - 10,
      size: 8,
      font,
      color: MUTED,
    });
    pg.drawText(
      pdfSafe(`${brand.name} · Laudo nº ${model.numero}${model.draft ? " · RASCUNHO" : ""}`),
      { x: M, y: M - 10, size: 8, font, color: MUTED },
    );
  });
  return pdf.save();
}
