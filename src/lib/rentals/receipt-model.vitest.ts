import { describe, expect, it } from "vitest";
import { buildReceiptModel, currentRentalCompetence, defaultReceiptInput } from "./receipt-model";
import type { RentalContractFull } from "@/types/rental";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { buildReceiptPdf } from "./receipt-pdf";
import { boletoProvider } from "../boleto/provider";

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
