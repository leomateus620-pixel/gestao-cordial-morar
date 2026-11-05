import { describe, expect, it } from "vitest";
import { buildReceiptModel, currentRentalCompetence, defaultReceiptInput } from "./receipt-model";
import type { RentalContractFull } from "@/types/rental";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { buildReceiptPdf } from "./receipt-pdf";
import { boletoProvider } from "../boleto/provider";
import { activeRecurringFor, type ReceiptInput, type TenantAdjustment } from "./receipt-model";
import { checkReceiptValores } from "./receipt-registration";
import { fitReceiptRows } from "./receipt-pdf";

const contract = {
  valorMensal: 385,
  comissaoMensal: 38.5,
  diaVencimento: 31,
  brand: "cordial",
  property: {
    proprietarioNome: "Locador",
    logradouro: "Rua",
    numero: "139",
    complemento: "Sala 2",
    cidade: "Santa Rosa",
    uf: "RS",
  },
  tenant: { nome: "Locatário" },
} as RentalContractFull;
describe("Modelo do recibo", () => {
  it("calcula as três vias em centavos", () => {
    const model = buildReceiptModel(contract, {
      ...defaultReceiptInput(contract, "2026-10"),
      iptu: 166.21,
      condominio: 239,
    });
    expect(model.totalPagar).toBe(790.21);
    expect(model.totalReceber).toBe(585.5);
  });
  it("atinge 512,71 quando o condomínio do locador é 166,21", () => {
    const model = buildReceiptModel(contract, {
      ...defaultReceiptInput(contract, "2026-10"),
      condominio: 166.21,
      iptu: 239,
    });
    expect(model.totalPagar).toBe(790.21);
    expect(model.totalReceber).toBe(512.71);
  });
  it("usa competência de São Paulo na virada do mês", () => {
    expect(currentRentalCompetence(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
  });
  it("ajusta vencimento para mês curto", () => {
    expect(defaultReceiptInput(contract, "2026-02").vencimento).toBe("2026-02-28");
  });
  it("preserva complemento e empresa", () => {
    const model = buildReceiptModel(contract, defaultReceiptInput(contract, "2026-10"));
    expect(model.address).toContain("Sala 2");
    expect(model.company.name).toBe("Cordial Imóveis");
  });
  it("recusa valor inválido", () => {
    expect(() =>
      buildReceiptModel(contract, { ...defaultReceiptInput(contract, "2026-10"), aluguel: NaN }),
    ).toThrow();
  });
  it("recusa datas inexistentes", () => {
    expect(() =>
      buildReceiptModel(contract, {
        ...defaultReceiptInput(contract, "2026-02"),
        vencimento: "2026-02-31",
      }),
    ).toThrow("Vencimento inválido");
  });
  it("não simula boleto sem provedor", () => {
    expect(boletoProvider).toBeNull();
  });
  it.each(["cordial", "morar"] as const)("gera A4 com logo da %s e três vias", async (brand) => {
    const model = buildReceiptModel(contract, {
      ...defaultReceiptInput(contract, "2026-10"),
      brand,
      condominio: 166.21,
      iptu: 239,
      seguroFianca: 12.5,
    });
    const logo = await readFile(`public${model.company.logo}`);
    const bytes = await buildReceiptPdf(model, logo);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89);
    expect(pdf.getTitle()).toBe(model.title);
  });
});

const maria = {
  ...contract,
  valorMensal: 1787.8,
  comissaoMensal: 178.78,
  seguroValorMensal: 0,
} as RentalContractFull;
const base = (): ReceiptInput => defaultReceiptInput(maria, "2026-10");
const fundo = (repassar = true): TenantAdjustment => ({
  id: "a1",
  tipo: "desconto",
  descricao: "Fundo de reserva",
  valor: 15,
  repassarProprietario: repassar,
});
const reparo = { id: "o1", tipo: "desconto" as const, descricao: "Reparo hidráulico", valor: 120 };
describe("Descontos e ajustes do recibo", () => {
  it("sem ajustes mantém totais atuais", () => {
    const m = buildReceiptModel(maria, base());
    expect(m.totalPagar).toBe(1787.8);
    expect(m.totalReceber).toBe(1609.02);
  });
  it("fundo de reserva repassado", () => {
    const m = buildReceiptModel(maria, { ...base(), ajustesInquilino: [fundo()] });
    expect(m.totalPagar).toBe(1772.8);
    expect(m.totalReceber).toBe(1594.02);
    expect(m.honorarios).toBe(178.78);
  });
  it("fundo de reserva não repassado", () => {
    const m = buildReceiptModel(maria, { ...base(), ajustesInquilino: [fundo(false)] });
    expect(m.totalPagar).toBe(1772.8);
    expect(m.totalReceber).toBe(1609.02);
  });
  it("reparo do proprietário só reduz o receber", () => {
    const m = buildReceiptModel(maria, {
      ...base(),
      ajustesInquilino: [fundo()],
      ajustesProprietario: [reparo],
    });
    expect(m.totalReceber).toBe(1474.02);
    expect(m.totalPagar).toBe(1772.8);
  });
  it("acréscimo de multa repassado", () => {
    const m = buildReceiptModel(maria, {
      ...base(),
      ajustesInquilino: [{ ...fundo(), tipo: "acrescimo", descricao: "Multa", valor: 35.76 }],
    });
    expect(m.totalPagar).toBe(1823.56);
    expect(m.totalReceber).toBe(1644.78);
  });
  it("precisão em centavos", () => {
    const m = buildReceiptModel(maria, {
      ...base(),
      aluguel: 0,
      honorarios: 0,
      ajustesInquilino: [
        { ...fundo(), tipo: "acrescimo", valor: 0.1 },
        { ...fundo(), id: "a2", tipo: "acrescimo", valor: 0.2 },
      ],
    });
    expect(m.totalPagar).toBe(0.3);
  });
  it("recusa descrição vazia, valor ≤ 0, total negativo e mais de 10 itens", () => {
    expect(() =>
      buildReceiptModel(maria, { ...base(), ajustesInquilino: [{ ...fundo(), descricao: "  " }] }),
    ).toThrow("descrição");
    expect(() =>
      buildReceiptModel(maria, { ...base(), ajustesInquilino: [{ ...fundo(), valor: 0 }] }),
    ).toThrow("maior que zero");
    expect(() =>
      buildReceiptModel(maria, { ...base(), ajustesInquilino: [{ ...fundo(), valor: 5000 }] }),
    ).toThrow("total negativo");
    expect(() =>
      buildReceiptModel(maria, {
        ...base(),
        ajustesInquilino: Array.from({ length: 11 }, (_, i) => ({ ...fundo(), id: `x${i}`, valor: 1 })),
      }),
    ).toThrow("máximo");
  });
  it("recusa repetição que termina antes da competência", () => {
    expect(() =>
      buildReceiptModel(maria, {
        ...base(),
        ajustesInquilino: [{ ...fundo(), repetir: true, fimCompetencia: "2026-09" }],
      }),
    ).toThrow("terminar antes");
  });
  it("recorrente aparece na competência seguinte e respeita o fim", () => {
    const rec = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        tipo: "desconto" as const,
        descricao: "Fundo de reserva",
        valor: 15,
        repassarProprietario: true,
        inicioCompetencia: "2026-10",
        fimCompetencia: "2026-11",
        ativo: true,
      },
    ];
    expect(defaultReceiptInput(maria, "2026-11", rec).ajustesInquilino).toHaveLength(1);
    expect(activeRecurringFor(rec, "2026-12")).toHaveLength(0);
    expect(activeRecurringFor(rec, "2026-09")).toHaveLength(0);
  });
  it("aceita valores legados sem arrays", () => {
    const legacy = { ...base(), totalPagar: 1787.8, totalReceber: 1609.02 };
    delete (legacy as Partial<ReceiptInput>).ajustesInquilino;
    delete (legacy as Partial<ReceiptInput>).ajustesProprietario;
    expect(checkReceiptValores("c", "2026-10", legacy).totalReceber).toBe(1609.02);
  });
  it("servidor recusa totais divergentes e comprovante fora do prefixo", () => {
    const cid = "22222222-2222-4222-8222-222222222222";
    const ok = { ...base(), ajustesInquilino: [fundo()], totalPagar: 1772.8, totalReceber: 1594.02 };
    expect(checkReceiptValores(cid, "2026-10", ok).totalPagar).toBe(1772.8);
    expect(() => checkReceiptValores(cid, "2026-10", { ...ok, totalReceber: 1609.02 })).toThrow(
      "não conferem",
    );
    const proof = {
      ...base(),
      ajustesProprietario: [{ ...reparo, comprovantePath: `outro/recibos/comprovantes/2026-10-1-ab.pdf` }],
      totalPagar: 1787.8,
      totalReceber: 1489.02,
    };
    expect(() => checkReceiptValores(cid, "2026-10", proof)).toThrow("Comprovante");
    proof.ajustesProprietario[0].comprovantePath = `${cid}/recibos/comprovantes/2026-10-1-ab.pdf`;
    expect(checkReceiptValores(cid, "2026-10", proof).totalReceber).toBe(1489.02);
  });
  it("agrupa excedentes em Outros ajustes", () => {
    const rows = fitReceiptRows([["Aluguel", 100]], [["a", -1], ["b", -2], ["c", -3]], 3);
    expect(rows).toEqual([["Aluguel", 100], ["a", -1], ["Outros ajustes (2)", -5]]);
  });
  it("gera PDF com 6 itens por lado", async () => {
    const tenant = Array.from({ length: 6 }, (_, i) => ({ ...fundo(), id: `t${i}`, descricao: `Item inquilino ${i}`, valor: 1 }));
    const owner = Array.from({ length: 6 }, (_, i) => ({ ...reparo, id: `o${i}`, descricao: `Item dono ${i}`, valor: 1 }));
    const model = buildReceiptModel(maria, { ...base(), ajustesInquilino: tenant, ajustesProprietario: owner });
    const logo = await readFile(`public${model.company.logo}`);
    const bytes = await buildReceiptPdf(model, logo);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const raw = Buffer.from(await PDFDocument.load(bytes).then((d) => d.save({ useObjectStreams: false }))).toString("latin1");
    expect(raw.length).toBeGreaterThan(1000);
    const small = buildReceiptModel(maria, { ...base(), ajustesInquilino: [fundo()] });
    const smallPdf = await buildReceiptPdf(small, logo);
    expect((await PDFDocument.load(smallPdf)).getPageCount()).toBe(1);
  });
});

import { RECEIPT_ADJUSTMENT_PRESETS, tenantAdjustmentFromPreset } from "./receipt-presets";

describe("Atalhos, água e descritivo", () => {
  const preset = (id: string) => RECEIPT_ADJUSTMENT_PRESETS.find((p) => p.id === id)!;
  it.each([
    ["agua", "inquilino", "acrescimo", "Água", false, false],
    ["fundo-reserva", "inquilino", "desconto", "Fundo de reserva", true, true],
    ["multa-juros", "inquilino", "acrescimo", "Multa/Juros por atraso", true, false],
    ["outro-acrescimo", "inquilino", "acrescimo", "", false, false],
    ["reparo", "proprietario", "desconto", "Reparo/Manutenção", false, false],
  ] as const)("preset %s", (id, side, tipo, descricao, repassar, repetir) => {
    const p = preset(id);
    expect([p.side, p.tipo, p.descricao, p.repassarProprietario, p.repetir]).toEqual([
      side, tipo, descricao, repassar, repetir,
    ]);
  });
  const c = { ...contract, valorMensal: 1100, comissaoMensal: 100, seguroValorMensal: 0 } as RentalContractFull;
  it("água 85,00 não repassada: 1.185,00 / 1.000,00", () => {
    const agua = { ...tenantAdjustmentFromPreset(preset("agua"), "w1"), valor: 85 };
    const m = buildReceiptModel(c, { ...defaultReceiptInput(c, "2026-10"), ajustesInquilino: [agua] });
    expect(m.totalPagar).toBe(1185);
    expect(m.totalReceber).toBe(1000);
  });
  it("descrição de 120 aceita, 121 recusada (cliente e servidor)", () => {
    const mk = (n: number) => ({ ...base(), ajustesInquilino: [{ ...fundo(), descricao: "x".repeat(n) }] });
    expect(() => buildReceiptModel(maria, mk(120))).not.toThrow();
    expect(() => buildReceiptModel(maria, mk(121))).toThrow("120");
    const ok = { ...mk(120), totalPagar: 1772.8, totalReceber: 1594.02 };
    expect(checkReceiptValores("c", "2026-10", ok).totalPagar).toBe(1772.8);
    expect(() => checkReceiptValores("c", "2026-10", { ...mk(121), totalPagar: 1772.8, totalReceber: 1594.02 })).toThrow();
  });
  it("PDF com 6 itens de 120 caracteres por lado em 1 página", async () => {
    const long = (i: number) => `Água ref. set/2026 leitura ${i} `.padEnd(120, "m");
    const tenant = Array.from({ length: 6 }, (_, i) => ({ ...fundo(), id: `t${i}`, descricao: long(i), valor: 1 }));
    const owner = Array.from({ length: 6 }, (_, i) => ({ ...reparo, id: `o${i}`, descricao: long(i), valor: 1 }));
    const model = buildReceiptModel(maria, { ...base(), ajustesInquilino: tenant, ajustesProprietario: owner });
    const bytes = await buildReceiptPdf(model, await readFile(`public${model.company.logo}`));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
  it("fitReceiptRows conta linhas de descrições longas", () => {
    const rows = fitReceiptRows([["Aluguel", 1]], [["a", 1], ["b", 1], ["c", 1]], 4, (l) => (l === "Aluguel" ? 1 : 2));
    expect(rows).toEqual([["Aluguel", 1], ["a", 1], ["Outros ajustes (2)", 2]]);
  });
  it("recorrência encerrada não volta na competência seguinte", () => {
    const rec = [{ id: "11111111-1111-4111-8111-111111111111", tipo: "desconto" as const, descricao: "Fundo", valor: 15, repassarProprietario: true, inicioCompetencia: "2026-10", fimCompetencia: null, ativo: true }];
    expect(defaultReceiptInput(maria, "2026-11", rec).ajustesInquilino).toHaveLength(1);
    const ended = rec.map((r) => ({ ...r, ativo: false }));
    expect(activeRecurringFor(ended, "2026-11")).toHaveLength(0);
    expect(defaultReceiptInput(maria, "2026-11", ended).ajustesInquilino).toHaveLength(0);
  });
});

describe("fundo de reserva: lado do inquilino x proprietário", async () => {
  const { receiptViaRows } = await import("./receipt-model");
  const { suggestTenantSide, ownerToTenantAdjustment } = await import("./receipt-presets");
  const base = {
    ...defaultReceiptInput(contract, "2026-10"),
    aluguel: 2200,
    honorarios: 200,
    condominio: 0,
    iptu: 0,
    seguroFianca: 0,
    vencimento: "2026-10-10",
  };
  const fundo = { id: "f", tipo: "desconto" as const, descricao: "Fundo de reserva", valor: 69.31 };
  it("desconto do inquilino repassado: 2.130,69 / 1.930,69 e aparece na via do locatário", () => {
    const m = buildReceiptModel(contract, {
      ...base,
      ajustesInquilino: [{ ...fundo, repassarProprietario: true }],
      ajustesProprietario: [],
    });
    expect(m.totalPagar).toBe(2130.69);
    expect(m.totalReceber).toBe(1930.69);
    const via0 = receiptViaRows(m, 0);
    expect(via0.adjustments).toEqual([["Desconto – Fundo de reserva", -69.31]]);
    expect(new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(m.totalPagar)).toBe("2.130,69");
  });
  it("mesmo item só do proprietário: 2.200 / 1.930,69, fora da via do locatário", () => {
    const m = buildReceiptModel(contract, { ...base, ajustesInquilino: [], ajustesProprietario: [fundo] });
    expect(m.totalPagar).toBe(2200);
    expect(m.totalReceber).toBe(1930.69);
    expect(receiptViaRows(m, 0).adjustments).toEqual([]);
    expect(receiptViaRows(m, 1).adjustments).toEqual([["Desconto – Fundo de reserva", -69.31]]);
  });
  it("suggestTenantSide reconhece variações e ignora reparo", () => {
    expect(suggestTenantSide("Fundo de reserva")).toBe(true);
    expect(suggestTenantSide("FUNDO  DE   RESERVA out")).toBe(true);
    expect(suggestTenantSide("fúndo de résérva")).toBe(true);
    expect(suggestTenantSide("Reparo/Manutenção")).toBe(false);
  });
  it("mover para o inquilino gera o caso correto", () => {
    const moved = ownerToTenantAdjustment({ ...fundo, tipo: "acrescimo" });
    expect(moved).toMatchObject({ tipo: "desconto", repassarProprietario: true, valor: 69.31, descricao: "Fundo de reserva" });
    const m = buildReceiptModel(contract, { ...base, ajustesInquilino: [moved], ajustesProprietario: [] });
    expect([m.totalPagar, m.totalReceber]).toEqual([2130.69, 1930.69]);
  });
});
