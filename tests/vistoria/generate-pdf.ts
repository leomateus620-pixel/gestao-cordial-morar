/** Sanitized visual fixture. Never queries or writes a real inspection. */
import { mkdir, writeFile } from "node:fs/promises";
import { buildInspectionPdf, type PdfModel } from "../../src/lib/vistoria/pdf";
import { emptyMeters, itemsForRoom } from "../../src/lib/vistoria/model";
import { pngOf } from "./png";
const model: PdfModel = {
  brand: "cordial",
  numero: 42,
  kind: "entrada",
  statusLabel: "Em revisão",
  version: null,
  draft: true,
  generatedAt: "2026-10-20T12:00:00Z",
  property: {
    codes: "Cordial DEMO-42 · Morar DEMO-84",
    tipo: "Apartamento de demonstração",
    endereco: "Rua de demonstração, 120 · Apartamento 302 · Cidade exemplo/RS",
  },
  responsible: "Corretora de demonstração",
  inspectedAt: "2026-10-20T11:00:00Z",
  participants: [
    {
      nome: "Participante de demonstração com nome extenso para verificar a quebra completa da assinatura sem truncar o conteúdo",
      papel: "Acompanhante da vistoria",
    },
  ],
  furnished: "Não",
  cleaning: "Limpo",
  keys: [{ descricao: "Chave da entrada", quantidade: 2 }],
  meters: {
    ...emptyMeters(),
    agua: { status: "informado", reading: "001234" },
    gas: { status: "nao_aplicavel" },
  },
  generalNotes:
    "Exemplo fictício para verificar o documento. Fotos sintéticas testam proporções e não representam avarias reais. Símbolos preservados: Ω, 漢, 🙂.",
  conclusion:
    "Conferir os registros de cada ambiente antes da emissão. Este exemplo permanece uma prévia não emitida.",
  rooms: ["Sala", "Cozinha", "Dormitório", "Banheiro"].map((name, r) => ({
    name,
    noPhotoReason: r > 1 ? "Ambiente fictício sem imagem de demonstração" : null,
    items: itemsForRoom((["sala", "cozinha", "dormitorio", "banheiro"] as const)[r], false).map(
      (it, i) => ({
        id: `${r}-${i}`,
        name: it.name,
        state: i === 0 ? "regular" : i === 1 ? "nao_testado" : i === 2 ? "nao_se_aplica" : "bom",
        quantity: null,
        material: i === 0 ? "Cerâmica" : null,
        color: i === 0 ? "Bege" : null,
        notes: i === 0 ? "Revestimento com marcas superficiais próximas à porta." : null,
        damage:
          i === 0 ? "Trinca superficial de aproximadamente 3 cm, conferida visualmente." : null,
        untested_reason:
          i === 1
            ? "Não foi possível realizar o teste durante este registro de demonstração."
            : null,
      }),
    ),
    notes: [
      {
        text: "Relato aprovado da demonstração. Os estados e vínculos de fotos foram revisados pelo responsável.",
        kind: "aprovado",
      },
    ],
    photos:
      r < 2
        ? [
            {
              path: `${r}-horizontal`,
              caption: "Vista geral do ambiente. Imagem sintética para teste de proporção.",
              takenAt: "2026-10-20T11:10:00Z",
              timeSource: "captura",
              itemId: null,
            },
            {
              path: `${r}-vertical`,
              caption:
                r === 0
                  ? "Detalhe vinculado ao piso. " +
                    "Legenda extensa preservada integralmente para verificar paginação e contexto do ambiente. ".repeat(
                      28,
                    )
                  : "Detalhe da área observada, com o contexto do item confirmado.",
              takenAt: "2026-10-20T11:12:00Z",
              timeSource: "importacao",
              itemId: `${r}-0`,
            },
          ]
        : [],
  })),
};
const horizontal = await pngOf(480, 240),
  vertical = await pngOf(180, 360);
const bytes = await buildInspectionPdf(model, async (p) => ({
  bytes: p.endsWith("vertical") ? vertical : horizontal,
  mime: "image/png",
}));
await mkdir("docs/vistoria-evidencias", { recursive: true });
await writeFile("docs/vistoria-evidencias/laudo-demonstracao.pdf", bytes);
console.log(`Laudo fictício: ${bytes.length} bytes`);
