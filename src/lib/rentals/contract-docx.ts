import {
  AlignmentType,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ContractLetterhead } from "./contract-letterhead";

/** Converte o texto da minuta em um arquivo Word (A4, Arial 11, justificado). */
export async function contractTextToDocx(
  text: string,
  letterhead: ContractLetterhead,
): Promise<Blob> {
  if (!letterhead.image.length || !letterhead.address.trim()) {
    throw new Error("Confira a logo e o endereço institucional antes de gerar o Word.");
  }
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const signatureStart = blocks.findIndex((block) => /^_{3,}/.test(block));
  const children = blocks.map((b, i) => {
    const isTitle = i === 0;
    const isHeading = /^CLÁUSULA\b/.test(b);
    const isSignature = signatureStart >= 0 && i >= signatureStart;
    const lines = b.split("\n");
    return new Paragraph({
      alignment: isTitle
        ? AlignmentType.CENTER
        : lines.length > 1
          ? AlignmentType.LEFT
          : AlignmentType.JUSTIFIED,
      spacing: { after: 160, line: 300 },
      keepLines: isTitle || isHeading || isSignature,
      keepNext: isTitle || isHeading || (isSignature && i < blocks.length - 1),
      children: lines.map(
        (l, j) => new TextRun({ text: l, bold: isTitle || isHeading, break: j > 0 ? 1 : 0 }),
      ),
    });
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: letterhead.type,
                    data: letterhead.image,
                    transformation: {
                      width: Math.round((52 * letterhead.width) / letterhead.height),
                      height: 52,
                    },
                    altText: {
                      name: letterhead.name,
                      title: letterhead.name,
                      description: letterhead.name,
                    },
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: letterhead.address, size: 18 })],
              }),
            ],
          }),
        },
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1900, right: 1418, bottom: 1418, left: 1418, header: 565, footer: 600 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
