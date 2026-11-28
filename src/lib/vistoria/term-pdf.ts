import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  setWordSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ITEM_STATE_LABEL, METER_LABEL, meterText, type Meters } from "./model";
import {
  PdfPhotoError,
  pdfSafe,
  wrapText,
  type ImageLoader,
  type PdfModel,
  type PdfPhoto,
  type PdfRoom,
} from "./pdf";
import { CONDITIONS, CONDITION_KEYS, type InspectionTerm } from "./term";
import logos from "./term-logos.json";
import { TERM_BRANDS } from "./term-brands";

const [width, height] = PageSizes.A4;
const margin = 56.7,
  body = width - margin * 2,
  bottom = 57,
  leading = 14;
const gutter = 9,
  maxHeight = 193;
type Photo = { image: PDFImage; caption: string; columns: 1 | 2 | 3 };
type PhotoRow = ReturnType<typeof measureRow>;
function measureRow(photos: Photo[], font: PDFFont) {
  const columns = photos[0].columns === 3 ? 3 : photos.length;
  const cell = (body - gutter * (columns - 1)) / columns;
  const entries = photos.map((p) => {
    const image = p.image.scaleToFit(cell, maxHeight);
    const lines = p.caption ? wrapText(p.caption, font, 10, cell) : [];
    return { ...p, ...image, lines };
  });
  return {
    cell,
    entries,
    height: Math.max(...entries.map((e) => e.height + e.lines.length * 12)) + 12,
  };
}
function photoRows(photos: Photo[], font: PDFFont) {
  const rows: PhotoRow[] = [];
  for (let i = 0; i < photos.length; ) {
    const span = photos[i].columns;
    const group = [photos[i++]];
    while (i < photos.length && group.length < span && photos[i].columns === span)
      group.push(photos[i++]);
    rows.push(measureRow(group, font));
  }
  return rows;
}
function roomDescription(room: PdfRoom) {
  return [
    ...room.notes.filter((n) => n.kind === "aprovado").map((n) => n.text),
    ...room.items.map((i) =>
      [
        `${i.name}: ${ITEM_STATE_LABEL[i.state]}`,
        i.material,
        i.color,
        i.quantity != null && `quantidade: ${i.quantity}`,
        i.notes,
        i.damage && `Avaria: ${i.damage}`,
        i.untested_reason && `Motivo do teste não realizado: ${i.untested_reason}`,
      ]
        .filter(Boolean)
        .join(". "),
    ),
    room.noPhotoReason,
  ].filter((t): t is string => Boolean(t?.trim()));
}

export async function renderInspectionTerm(
  model: PdfModel,
  term: InspectionTerm,
  loadImage: ImageLoader,
) {
  if (!term.brand || (!model.draft && term.issues.length)) throw new Error(term.issues.join("\n"));
  const brand = TERM_BRANDS[term.brand];
  const doc = await PDFDocument.create();
  const title = `TERMO DE VISTORIA DE IMÓVEL${term.purpose ? " " + term.purpose.toUpperCase() : ""}${model.kind === "saida" ? " - SAÍDA" : ""}`;
  doc.setTitle(title);
  doc.setAuthor(brand.name);
  doc.setSubject(
    `Vistoria ${model.numero} · ${model.kind} · ${model.draft ? "prévia" : "v" + model.version}`,
  );
  doc.setCreationDate(new Date(model.generatedAt));
  doc.setModificationDate(new Date(model.generatedAt));
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const footerFont = await doc.embedFont(StandardFonts.Helvetica);
  const logo = await doc.embedPng(logos[brand.logo]);
  const footer = brand.printWebsite ? [brand.address, brand.website] : [brand.address];
  const [red, green, blue] = brand.footerColor;
  const logoHeight = (brand.logoWidth * logo.height) / logo.width;
  const top = height - 16 - logoHeight - 14;
  let page: PDFPage,
    y = 0,
    continuation = "";
  function center(t: string, f: PDFFont, size: number, baseline: number, color = rgb(0, 0, 0)) {
    const line = pdfSafe(t);
    page.drawText(line, {
      x: (width - f.widthOfTextAtSize(line, size)) / 2,
      y: baseline,
      size,
      font: f,
      color,
    });
  }
  function newPage() {
    page = doc.addPage(PageSizes.A4);
    page.drawImage(logo, {
      x: (width - brand.logoWidth) / 2,
      y: height - 16 - logoHeight,
      width: brand.logoWidth,
      height: logoHeight,
    });
    footer.forEach((t, i) =>
      center(t, footerFont, 9, 20 + (footer.length - i - 1) * 12, rgb(red, green, blue)),
    );
    if (model.draft) page.drawText("PRÉVIA", { x: margin, y: height - 32, font: bold, size: 9 });
    y = top;
    if (continuation) {
      for (const line of wrapText(continuation + " - continuação", bold, 11, body)) {
        page.drawText(line, { x: margin, y: y - 11, font: bold, size: 11 });
        y -= leading;
      }
      y -= 5;
    }
  }
  function ensure(h: number) {
    if (y - h < bottom) newPage();
  }
  function paragraph(t: string, f = font, size = 11, gap = 6, centered = false) {
    const lines = wrapText(t, f, size, body);
    for (const [index, line] of lines.entries()) {
      ensure(leading + 1);
      if (centered) center(line, f, size, y - size);
      else if (f === font && index < lines.length - 1 && line.includes(" ") && !t.includes("\n")) {
        const spaces = line.split(" ").length - 1;
        page.pushOperators(
          pushGraphicsState(),
          setWordSpacing((body - f.widthOfTextAtSize(line, size)) / spaces),
        );
        page.drawText(line, { x: margin, y: y - size, font: f, size });
        page.pushOperators(popGraphicsState());
      } else page.drawText(line, { x: margin, y: y - size, font: f, size });
      y -= leading;
    }
    y -= gap;
  }
  // The source sets party names and condition labels in bold on the same
  // baseline as their text. Measure both faces before placing that first line.
  function labelled(label: string, value: string) {
    const prefix = pdfSafe(label);
    const prefixWidth = Array.from(prefix).reduce((w, ch) => w + bold.widthOfTextAtSize(ch, 11), 0);
    if (!value || prefixWidth > body * 0.75) {
      paragraph(prefix, bold, 11, value ? 0 : 6);
      if (value) paragraph(value);
      return;
    }
    const [first, ...rest] = pdfSafe(value).split("\n");
    const words = first.split(/\s+/).filter(Boolean);
    let end = 0;
    while (
      end < words.length &&
      font.widthOfTextAtSize(words.slice(0, end + 1).join(" "), 11) <=
        body - prefixWidth - font.widthOfTextAtSize(" ", 11)
    )
      end++;
    ensure(leading + 1);
    page.drawText(prefix, { x: margin, y: y - 11, size: 11, font: bold });
    page.drawText(" " + words.slice(0, end).join(" "), {
      x: margin + prefixWidth,
      y: y - 11,
      size: 11,
      font,
    });
    y -= leading;
    const remaining = [words.slice(end).join(" "), ...rest].join("\n").trimStart();
    if (remaining) paragraph(remaining);
    else y -= 6;
  }
  function heading(t: string) {
    ensure(wrapText(t, bold, 11, body).length * leading + 24);
    paragraph(t, bold, 11, 4);
  }
  const failed: PdfPhotoError["failed"] = [];
  let number = 0;
  async function embed(p: PdfPhoto, room: string): Promise<Photo | null> {
    const nr = ++number;
    try {
      const { bytes, mime } = await loadImage(p.path);
      const image = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      return {
        image,
        caption: p.caption || "",
        columns: image.height > image.width ? 3 : image.width > image.height * 2 ? 1 : 2,
      };
    } catch (error) {
      failed.push({
        number: nr,
        room,
        path: p.path,
        reason: error instanceof Error ? error.message : "Falha ao carregar",
      });
      return null;
    }
  }
  function drawRow(row: PhotoRow) {
    // Exceptionally long captions may continue as full-width paragraphs.
    if (row.height > top - bottom - 52) {
      for (const e of row.entries) {
        drawRow(measureRow([{ ...e, caption: "" }], font));
        if (e.caption) paragraph(e.caption, font, 10);
      }
      return;
    }
    ensure(row.height);
    const rowWidth = row.entries.length * row.cell + (row.entries.length - 1) * gutter;
    row.entries.forEach((p, index) => {
      const x = (width - rowWidth) / 2 + index * (row.cell + gutter);
      page.drawImage(p.image, {
        x: x + (row.cell - p.width) / 2,
        y: y - p.height,
        width: p.width,
        height: p.height,
      });
      p.lines.forEach((line, j) =>
        page.drawText(line, { x, y: y - p.height - 11 - j * 12, font, size: 10 }),
      );
    });
    y -= row.height;
  }

  newPage();
  paragraph(title, bold, 13, 12, true);
  for (const p of term.parties)
    labelled(
      p.role.toUpperCase() + ": " + p.name.toUpperCase() + (p.qualification ? "," : ""),
      p.qualification
        ? p.qualification + ', doravante denominado(a) "' + p.role.toUpperCase() + '".'
        : "",
    );
  const approved = model.kind === "entrada" && term.purpose === "residencial";
  if (approved) for (const t of brand.entry(model.property.endereco)) paragraph(t);
  else if (model.property.endereco) paragraph(`Imóvel vistoriado: ${model.property.endereco}.`);
  heading("RELATÓRIO");
  if (term.purpose) paragraph(`Destinação do imóvel: ${term.purpose}.`);
  for (const k of CONDITION_KEYS)
    if (term.conditions[k]?.trim()) labelled(CONDITIONS[k].toUpperCase() + ":", term.conditions[k]);
  if (model.furnished && model.furnished !== "Não informado")
    paragraph(`Mobiliado: ${model.furnished}.`);
  if (model.cleaning && model.cleaning !== "Não informado")
    paragraph(`Limpeza: ${model.cleaning}.`);

  const meters: Record<keyof Meters, Photo[]> = { agua: [], luz: [], gas: [] };
  for (const r of model.rooms) {
    const ordinary: Photo[] = [];
    for (const p of r.photos) {
      const photo = await embed(p, r.name);
      if (!photo) continue;
      if (p.meter)
        meters[p.meter].push({
          ...photo,
          caption: [r.name, photo.caption].filter(Boolean).join(" · "),
        });
      else ordinary.push(photo);
    }
    const rows = photoRows(ordinary, font);
    const desc = roomDescription(r);
    const textHeight = desc.reduce(
      (h, t) => h + leading * wrapText(t, font, 11, body).length + 6,
      0,
    );
    const titleHeight = leading * wrapText(r.name.toUpperCase(), bold, 11, body).length + 4;
    const withPhotos = titleHeight + textHeight + (rows[0]?.height ?? 0);
    ensure(
      withPhotos <= top - bottom ? withPhotos : titleHeight + Math.min(textHeight, 2 * leading),
    );
    paragraph(r.name.toUpperCase(), bold, 11, 4);
    continuation = r.name;
    for (const t of desc) paragraph(t);
    for (const row of rows) drawRow(row);
    continuation = "";
    y -= 6;
  }
  if (failed.length) throw new PdfPhotoError(failed);
  const finalNotes = [model.generalNotes, model.conclusion].filter((t): t is string =>
    Boolean(t?.trim()),
  );
  if (finalNotes.length) {
    heading("OBSERVAÇÕES");
    for (const t of finalNotes) paragraph(t);
  }
  if (model.keys.length)
    paragraph(
      `Chaves e controles: ${model.keys.map((k) => k.quantidade + " × " + k.descricao).join(", ")}.`,
    );
  for (const k of ["luz", "agua", "gas"] as const) {
    const m = model.meters[k],
      rows = photoRows(meters[k], font);
    if (m?.status === "nao_informado" && !m.number && !rows.length) continue;
    const label = `MEDIDOR DE ${METER_LABEL[k].toUpperCase()}`;
    const value = [m?.status !== "nao_informado" && meterText(m), m?.number && "Nº " + m.number]
      .filter(Boolean)
      .join(" · ");
    const line = label + (value ? ": " + value : "");
    ensure(
      Math.min(
        top - bottom,
        wrapText(line, bold, 11, body).length * leading + 6 + (rows[0]?.height ?? 0),
      ),
    );
    paragraph(line, bold);
    continuation = label;
    for (const row of rows) drawRow(row);
    continuation = "";
  }
  const date =
    model.inspectedAt &&
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(
      new Date(model.inspectedAt),
    );
  const sign = (p: (typeof term.parties)[number]) => {
    const lines = wrapText(p.name, bold, 11, body);
    ensure(52 + lines.length * leading);
    y -= 28;
    page.drawLine({
      start: { x: width / 2 - 111, y },
      end: { x: width / 2 + 111, y },
      thickness: 0.5,
    });
    y -= 2;
    paragraph(p.name, bold, 11, 0, true);
    paragraph(p.role, font, 11, 3, true);
  };
  const closingHeight =
    (approved ? wrapText(brand.closing, font, 11, body).length * leading + 6 : 0) +
    leading +
    5 +
    term.parties.reduce(
      (h, p) => h + 33 + leading * (1 + wrapText(p.name, bold, 11, body).length),
      0,
    ) +
    81;
  ensure(closingHeight <= top - bottom ? closingHeight : 100);
  if (approved) paragraph(brand.closing);
  if (term.city || date)
    paragraph([term.city, date].filter(Boolean).join(", ") + ".", font, 11, 5, true);
  term.parties.forEach(sign);
  ensure(81);
  heading("Testemunhas");
  for (let i = 1; i <= 2; i++)
    paragraph(
      `${i}. Nome: ____________________________________     CPF: __________________`,
      font,
      11,
      12,
    );
  return doc.save();
}
