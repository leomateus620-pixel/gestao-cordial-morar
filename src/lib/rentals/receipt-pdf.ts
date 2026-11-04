import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ReceiptModel } from "./receipt-model";

const brlAbs = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const brl = (value: number) => (value < 0 ? `- ${brlAbs(-value)}` : brlAbs(value));
type Adj = { tipo: "desconto" | "acrescimo"; descricao: string; valor: number };
const adjRow = (a: Adj): [string, number] => [
  `${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"} – ${a.descricao}`,
  a.tipo === "acrescimo" ? a.valor : -a.valor,
];
/** Fit rows into the via; overflow adjustments are grouped as "Outros ajustes (n)". */
export function fitReceiptRows(
  base: [string, number][],
  adjustments: [string, number][],
  max: number,
  linesOf: (label: string) => number = () => 1,
) {
  const used = base.reduce((s, [l]) => s + linesOf(l), 0);
  const all = adjustments.reduce((s, [l]) => s + linesOf(l), 0);
  if (used + all <= max) return [...base, ...adjustments];
  let keep = 0;
  let total = used;
  while (keep < adjustments.length && total + linesOf(adjustments[keep][0]) + 1 <= max) {
    total += linesOf(adjustments[keep][0]);
    keep++;
  }
  const rest = adjustments.slice(keep);
  const sum = rest.reduce((s, [, v]) => s + Math.round(v * 100), 0) / 100;
  return [...base, ...adjustments.slice(0, keep), [`Outros ajustes (${rest.length})`, sum] as [string, number]];
}
export async function buildReceiptPdf(
  model: ReceiptModel,
  logoBytes: Uint8Array,
  cnpj?: string | null,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(model.title);
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo =
    model.brand === "morar" ? await pdf.embedJpg(logoBytes) : await pdf.embedPng(logoBytes);
  const ink = rgb(0.1, 0.1, 0.1);
  const clean = (s: string) =>
    Array.from(s)
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  function draw(s: string, x: number, y: number, size = 9, f: PDFFont = font, width = 520) {
    const text = clean(s);
    const actual = Math.min(size, width / Math.max(f.widthOfTextAtSize(text, 1), 1));
    page.drawText(text, { x, y, size: actual, font: f, color: ink });
  }
  function wrap(s: string, width: number) {
    return wrapWith(s, width, bold);
  }
  function wrapWith(s: string, width: number, f: PDFFont) {
    const words = clean(s).split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(next, 9) > width && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    return lines;
  }
  const vias = ["1 via locatário", "1 via locador", "1 via imob"];
  vias.forEach((via, index) => {
    const top = 817 - index * 274;
    const titleWidth = bold.widthOfTextAtSize(clean(model.title), 10);
    draw(model.title, (595.28 - titleWidth) / 2, top, 10, bold);
    page.drawRectangle({
      x: 30,
      y: top - 76,
      width: 535,
      height: 66,
      borderWidth: 0.7,
      borderColor: ink,
    });
    const scaled = logo.scaleToFit(87, 42);
    page.drawImage(logo, { x: 39, y: top - 57, width: scaled.width, height: scaled.height });
    draw(model.companyDetails.creci, 138, top - 24, 9);
    draw(model.companyDetails.address, 138, top - 36, 9);
    draw(model.companyDetails.city, 138, top - 48, 9);
    draw(model.companyDetails.phone, 138, top - 60, 8.5, font, 240);
    draw(`Site: ${model.company.site}`, 389, top - 24, 8, font, 168);
    if (cnpj) draw(`CNPJ: ${cnpj}`, 389, top - 38, 8, font, 168);
    draw(via, 453, top - 68, 8, bold, 105);
    let y = top - 91;
    draw(`Locador: ${model.owner}`, 35, y, 9, bold);
    y -= 12;
    draw(`Locatário(a): ${model.tenant}`, 35, y, 9, bold);
    y -= 12;
    const addressLines = wrap(`Imóvel: ${model.address}`, 525);
    addressLines
      .slice(0, 2)
      .forEach((line, i) =>
        draw(
          i === 1 && addressLines.length > 2 ? addressLines.slice(1).join(" ") : line,
          35,
          y - i * 11,
          9,
          bold,
          525,
        ),
      );
    y -= Math.min(addressLines.length, 2) * 11;
    draw(`Vencimento: ${model.vencimento.split("-").reverse().join("/")}`, 35, y, 9, bold);
    y -= 13;
    draw("Valores:", 35, y, 9, bold);
    const rows: [string, number][] = [
      [`Aluguel${index === 0 && model.observacao ? ` (${model.observacao})` : ""}`, model.aluguel],
    ];
    if (index !== 0 && model.honorarios) rows.push(["Honorários", model.honorarios]);
    if (index !== 1 && model.iptu)
      rows.push([`IPTU${model.iptuParcela ? ` ${model.iptuParcela}` : ""}`, model.iptu]);
    if (index !== 1 && model.seguroFianca) rows.push(["Seguro Fiança", model.seguroFianca]);
    if (model.condominio) rows.push(["Condomínio", model.condominio]);
    const tenantAdj = model.ajustesInquilino.map(adjRow);
    const ownerAdj = [
      ...model.ajustesInquilino.filter((a) => a.repassarProprietario).map(adjRow),
      ...model.ajustesProprietario.map(adjRow),
    ];
    const extra = index === 0 ? tenantAdj : index === 1 ? ownerAdj : [];
    const maxRows = Math.floor((y - 12 - (top - 228)) / 11) + 1;
    const labelLines = (label: string) => {
      const lines = wrapWith(label, 258, font);
      if (lines.length <= 2) return lines;
      let second = lines.slice(1).join(" ");
      while (second && font.widthOfTextAtSize(`${second}…`, 9) > 258) second = second.slice(0, -1);
      return [lines[0], `${second.trimEnd()}…`];
    };
    const fitted = fitReceiptRows(rows, extra, maxRows, (l) => labelLines(l).length);
    let line = 0;
    fitted.forEach(([label, value]) => {
      const lines = labelLines(label);
      draw(brl(value), 310, y - 12 - line * 11, 9, bold, 78);
      lines.forEach((t) => {
        draw(t, 46, y - 12 - line * 11, 9, font, 260);
        line++;
      });
    });
    if (index === 0) draw(`Total a pagar: ${brl(model.totalPagar)}`, 398, y - 14, 9, bold, 160);
    if (index === 1) draw(`Total a receber: ${brl(model.totalReceber)}`, 398, y - 14, 9, bold, 160);
    if (index === 2)
      [
        ["Valor locatário", model.totalPagar],
        ["Honorários", model.honorarios],
        ["Valor locador", model.totalReceber],
      ].forEach(([label, value], i) =>
        draw(`${label}: ${brl(Number(value))}`, 398, y - 14 - i * 13, 9, bold, 160),
      );
    if (index === 2 && (model.ajustesInquilino.length || model.ajustesProprietario.length)) {
      const owner = Math.round((model.ajusteRepassado + model.ajusteProprietario) * 100) / 100;
      draw(
        `Ajustes: inquilino ${brl(model.ajusteInquilino)} / proprietário ${brl(owner)}`,
        398,
        y - 14 - 3 * 13,
        8,
        font,
        160,
      );
    }
    draw("Data: ___/___/____. ______________", 35, top - 239, 9);
    draw(index === 2 ? "Locador" : model.company.name, 35, top - 252, 9, bold);
    if (index < 2)
      page.drawLine({
        start: { x: 25, y: top - 262 },
        end: { x: 570, y: top - 262 },
        thickness: 0.6,
        color: ink,
        dashArray: [3, 3],
      });
  });
  return pdf.save();
}
