import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

/** Converte o texto da minuta em um arquivo Word (A4, Arial 11, justificado). */
export async function contractTextToDocx(text: string): Promise<Blob> {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const children = blocks.map((b, i) => {
    const isTitle = i === 0;
    const isHeading = /^CLÁUSULA\b/.test(b);
    const lines = b.split("\n");
    return new Paragraph({
      alignment: isTitle
        ? AlignmentType.CENTER
        : lines.length > 1
          ? AlignmentType.LEFT
          : AlignmentType.JUSTIFIED,
      spacing: { after: 160, line: 300 },
      children: lines.map(
        (l, j) => new TextRun({ text: l, bold: isTitle || isHeading, break: j > 0 ? 1 : 0 }),
      ),
    });
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1418, right: 1418, bottom: 1418, left: 1418 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
