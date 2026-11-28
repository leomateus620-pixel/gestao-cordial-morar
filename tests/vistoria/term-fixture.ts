import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { userId } from "./database";
import { pngOf } from "./png";
import type { InspectionData } from "../../src/lib/vistoria/types";
import { renderOfficialInspection } from "../../src/lib/vistoria/official-pdf.server";
import { rentalExample } from "../rentals/example";

export const contractId = "60000000-0000-4000-8000-000000000001";
export const inspectionId = "60000000-0000-4000-8000-000000000002";
const names = [
  "Despensa",
  "Vestíbulo",
  "Varanda coberta",
  "Ateliê dos fundos",
  "Sala de estar",
  "Dormitório principal",
  "Abrigo dos medidores",
];
const counts = [0, 1, 2, 3, 4, 7, 2];

export async function seedTerm(db: PGlite, brand: "cordial" | "morar") {
  const ex = rentalExample(brand),
    p = ex.property.data;
  const photos = new Map<string, Uint8Array>();
  await db.exec(
    "SELECT set_config('test.role','secretaria',false),set_config('test.morar','on',false); SET ROLE service_role",
  );
  await db.query("SELECT rental_save_workspace_draft($1,$2,0,$3)", [userId, contractId, { brand }]);
  const contractPath = contractId + "/contrato-sintetico.docx";
  await db.query("INSERT INTO storage.objects VALUES('rental-documents',$1)", [contractPath]);
  const file = (
    await db.query<{ doc: { id: string } }>(
      "SELECT rental_register_workflow_file($1,$2,'1',true,$3) doc",
      [
        userId,
        contractId,
        {
          filePath: contractPath,
          fileName: "Contrato fictício.docx",
          mimeType: "application/octet-stream",
          category: "contrato_aluguel",
          origin: "externo",
          sizeBytes: 125,
        },
      ],
    )
  ).rows[0].doc;
  await db.query("SELECT rental_confirm_workflow_file($1,$2,$3,'1',true,$4)", [
    userId,
    contractId,
    file.id,
    {
      property: {
        apelido: p.apelido,
        tipo: p.tipo,
        logradouro: p.logradouro,
        numero: p.numero,
        cidade: p.cidade,
        uf: p.uf,
        proprietario_nome: p.proprietarioNome,
        proprietario_cpf: p.proprietarioCpf,
        status: "alugado",
      },
      tenants: ["Pessoa Locatária Alfa", "Pessoa Locatária Beta"].map((nome, n) => ({
        nome,
        cpf_cnpj: "DEMO-T" + n,
        telefone: "00000000",
        endereco: "Alameda Fictícia, " + (11 + n),
        profissao: "Analista",
      })),
      guarantees: [{ tipo: "caucao", valor_caucao: 2800 }],
      contract: {
        valor_mensal: 1400,
        data_inicio: ex.dataInicio,
        data_fim: ex.dataFim,
        dia_vencimento: 10,
        status: "pendente_assinatura",
        payment_status: "pendente",
        garantia_tipo: "caucao",
        template_options: {
          ...ex.template,
          modelBrand: brand,
          tenants: [ex.template.tenants?.[0], { ...ex.template.tenants?.[0], rg: "DEMO-02" }],
        },
      },
    },
  ]);
  await db.exec("RESET ROLE; SET ROLE authenticated");
  const propertyId = (
    await db.query<{ property_id: string }>(
      "SELECT property_id FROM rental_contracts WHERE id=$1",
      [contractId],
    )
  ).rows[0].property_id;
  await db.query("SELECT inspection_create($1,$2)", [
    {
      id: inspectionId,
      rental_property_id: propertyId,
      rental_contract_id: contractId,
      rental_kind: "entrada",
      kind: "entrada",
      agency: brand,
      responsible_id: userId,
      responsible_name: "Secretaria de demonstração",
      inspected_at: "2026-11-26T14:00:00Z",
      participants: [],
      furnished: "nao_informado",
      cleaning: "nao_informado",
      keys: [],
      meters: {
        agua: { status: "informado", reading: "00047,08 m³" },
        luz: { status: "desligado" },
      },
      property_snapshot: {
        cadastro: { cidade: p.cidade, tipo: p.tipo },
        endereco: "Rua das Araucárias, 42, Bairro Exemplo, Santa Rosa/RS",
      },
      plan_confirmed: true,
    },
    names.map((name) => ({ name, kind: "outro", items: [] })),
  ]);
  await db.query("UPDATE inspections SET term_conditions=$2,general_notes=$3 WHERE id=$1", [
    inspectionId,
    {
      pintura: "Pintura fosca nas paredes internas. Marca junto à tomada do vestíbulo.",
      fechaduras: "O trinco da porta da varanda apresenta folga ao fechar.",
      eletrica: "Fornecimento desligado durante a visita.",
      hidraulica: "Registro de água acessível no abrigo externo.",
      pisos: "Piso cerâmico na sala, com pequena trinca junto ao rodapé.",
      janelas: "Vidros transparentes e esquadrias de alumínio na sala.",
    },
    "No ateliê, a trinca junto à borda do batente está documentada na imagem de detalhe.",
  ]);
  const rooms = (
    await db.query<{ id: string; position: number }>(
      "SELECT id,position FROM inspection_rooms WHERE inspection_id=$1 ORDER BY position",
      [inspectionId],
    )
  ).rows;
  for (const r of rooms) {
    const n = r.position,
      desc = [
        "Prateleiras de madeira fixadas na parede dos fundos.",
        "Porta de madeira com maçaneta metálica. Há uma marca superficial junto à tomada.",
        "Peitoril em pedra e piso cerâmico. O trinco da porta apresenta folga.",
        "A iluminação natural entra pela janela lateral. Há uma fissura fina no batente, visível junto à borda direita da foto.",
        "Paredes com acabamento fosco e piso cerâmico junto à janela. A pequena trinca acompanha a extremidade do rodapé.",
        "No encontro entre o peitoril e a parede, o revestimento apresenta marcas superficiais. ".repeat(
          18,
        ) + "O último detalhe foi conferido pela equipe.",
        "Os registros ficam na face externa do abrigo.",
      ][n];
    await db.query(
      "INSERT INTO inspection_notes(inspection_id,room_id,client_key,source,status,approved_text) VALUES ($1,$2,$3,'texto','revisado',$4)",
      [inspectionId, r.id, "relato-demo-" + n, desc],
    );
    if (!counts[n])
      await db.query(
        "UPDATE inspection_rooms SET no_photo_reason='Acesso restrito para fotografia durante a visita.' WHERE id=$1",
        [r.id],
      );
    for (let j = 0; j < counts[n]; j++) {
      const key = `foto-demo-${n}-${j}`,
        path = `${inspectionId}/${r.id}/${key}.png`;
      const panoramic = n === 4 && j === 2,
        landscape = n === 2 || (n === 4 && j === 1);
      const bytes =
        n === 6
          ? await readFile(
              new URL("./fixtures/medidor-" + (j === 0 ? "luz" : "agua") + ".png", import.meta.url),
            )
          : await pngOf(
              panoramic ? 540 : landscape ? 320 : 150,
              panoramic ? 95 : landscape ? 170 : 200,
              n * 8 + j + 1,
            );
      photos.set(path, bytes);
      await db.query(
        "INSERT INTO inspection_media(inspection_id,room_id,client_key,storage_path,mime,size_bytes,status,position,caption,meter) VALUES($1,$2,$3,$4,'image/png',$5,'confirmada',$6,$7,$8)",
        [
          inspectionId,
          r.id,
          key,
          path,
          bytes.length,
          j,
          n === 3 && j === 2 ? "Trinca junto ao batente." : null,
          n === 6 ? (j === 0 ? "luz" : "agua") : null,
        ],
      );
    }
  }
  await db.query(
    "INSERT INTO inspection_items(inspection_id,room_id,name,state,untested_reason) VALUES($1,$2,'Tomada da bancada','nao_testado','Circuito desligado durante a visita.')",
    [inspectionId, rooms[3].id],
  );
  await db.query("UPDATE inspections SET plan_confirmed=true WHERE id=$1", [inspectionId]);
  const snapshot = async () =>
    (await db.query<{ s: InspectionData }>("SELECT inspection_snapshot($1) s", [inspectionId]))
      .rows[0].s;
  const loader = async (path: string) => {
    const bytes = photos.get(path);
    if (!bytes) throw new Error("Foto ausente no armazenamento de teste");
    return { bytes, mime: "image/png" };
  };
  // Local object storage keeps the actual bytes. The service-only SQL finalizer
  // verifies the registered path and snapshot just as it does in the application.
  const archives = new Map<string, Uint8Array>();
  async function emit(s: InspectionData) {
    const out = await renderOfficialInspection(s, loader);
    await db.exec("RESET ROLE; SET ROLE service_role");
    try {
      await db.query("INSERT INTO storage.objects VALUES('inspection-media',$1)", [out.path]);
      if (!archives.has(out.path)) archives.set(out.path, out.bytes);
      await db.query("SELECT inspection_finalize_server($1,$2,$3,$4,$5,$6,$7)", [
        userId,
        inspectionId,
        s.inspection.revision,
        out.path,
        out.bytes.length,
        out.sha,
        s,
      ]);
    } finally {
      await db.exec("RESET ROLE; SET ROLE authenticated");
    }
    return out;
  }
  async function download(version: number) {
    const [doc] = (
      await db.query<{ storage_path: string; sha256: string }>(
        "SELECT storage_path,sha256 FROM inspection_documents WHERE inspection_id=$1 AND version=$2",
        [inspectionId, version],
      )
    ).rows;
    return { bytes: archives.get(doc.storage_path)!, sha: doc.sha256 };
  }
  return { snapshot, photos, loader, emit, download };
}
