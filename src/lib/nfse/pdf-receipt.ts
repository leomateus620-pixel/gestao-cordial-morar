import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type NfseReceiptData = {
  modoTeste: boolean;
  numero: string | null;
  serie: string | null;
  dataEmissao: string | null;
  codigoVerificador: string | null;
  linkConsulta: string | null;
  prestadorNome: string;
  prestadorCnpj: string;
  tomadorNome: string;
  tomadorDocumento: string;
  tomadorEndereco: string;
  descricao: string;
  competencia: string; // YYYY-MM-DD ou YYYY-MM
  valor: number;
  itemServico: string;
  imovel: string | null;
};

function fmtDoc(d: string) {
  const n = d.replace(/\D/g, "");
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Comprovante PDF da NFS-e, com os dados devolvidos pela prefeitura e o link oficial de autenticidade. */
export async function buildNfseReceiptPdf(d: NfseReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`NFS-e ${d.numero ?? ""} - ${d.prestadorNome}`);
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.16, 0.2);
  const muted = rgb(0.4, 0.44, 0.48);
  const accent = rgb(0.18, 0.37, 0.47);
  const M = 48;
  const W = 595 - M * 2;
  let y = 842 - M;

  const wrap = (text: string, size: number, f = font, width = W) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (let w of words) {
      while (f.widthOfTextAtSize(w, size) > width) {
        let k = w.length;
        while (k > 1 && f.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
        if (cur) {
          lines.push(cur);
          cur = "";
        }
        lines.push(w.slice(0, k));
        w = w.slice(k);
      }
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const text = (t: string, size = 10, f = font, color = ink, x = M, width = W) => {
    for (const line of wrap(t, size, f, width)) {
      page.drawText(line, { x, y, size, font: f, color });
      y -= size + 4;
    }
  };
  const section = (title: string) => {
    y -= 8;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 0.6, color: rgb(0.85, 0.86, 0.87) });
    y -= 8;
    text(title.toUpperCase(), 8, bold, accent);
    y -= 2;
  };
  const field = (label: string, value: string) => {
    text(label, 8, font, muted);
    text(value || "—", 10.5, bold);
    y -= 2;
  };

  if (d.modoTeste) {
    page.drawRectangle({ x: M, y: y - 26, width: W, height: 30, color: rgb(0.99, 0.95, 0.85) });
    page.drawText("TESTE — SEM VALOR FISCAL", { x: M + 10, y: y - 16, size: 12, font: bold, color: rgb(0.55, 0.33, 0.05) });
    y -= 44;
  }
  text("Nota Fiscal de Serviço Eletrônica — NFS-e", 16, bold);
  text("Prefeitura Municipal de Santa Rosa/RS · Comprovante de emissão", 9.5, font, muted);
  y -= 6;
  const comp = d.competencia.slice(0, 7).split("-");
  const compLabel = comp.length === 2 ? `${comp[1]}/${comp[0]}` : d.competencia;
  field(
    "Número · Série · Emissão",
    `${d.numero ?? "—"} · ${d.serie ?? "—"} · ${d.dataEmissao ?? "—"}`,
  );
  field("Código de verificação", d.codigoVerificador ?? "—");

  section("Prestador");
  field("Razão social", d.prestadorNome);
  field("CNPJ", fmtDoc(d.prestadorCnpj));

  section("Tomador");
  field("Nome", d.tomadorNome);
  field("CPF/CNPJ", fmtDoc(d.tomadorDocumento));
  field("Endereço fiscal", d.tomadorEndereco);

  section("Serviço");
  field("Discriminação", d.descricao);
  if (d.imovel) field("Imóvel", d.imovel);
  field("Item da lista de serviço", d.itemServico);
  field("Competência", compLabel);

  section("Valor");
  y -= 12;
  text(brl(d.valor), 20, bold, accent);
  y -= 6;

  if (d.linkConsulta) {
    section("Autenticidade");
    text("Confira a autenticidade no portal da prefeitura:", 9, font, muted);
    text(d.linkConsulta, 8, font, accent);
  }
  page.drawText(
    "Documento gerado pelo Gestão Cordial/Morar a partir do retorno oficial da prefeitura.",
    { x: M, y: M - 10, size: 7.5, font, color: muted },
  );
  return pdf.save();
}
