import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  fillContract,
  insurersForBrand,
  missingFields,
  qualify,
  type ContractData,
  type ContractInsurer,
} from "./contract-generator";
import { reaisPorExtenso } from "./money-extenso";

const tpl = (k: string) =>
  readFileSync(new URL(`./contract-templates/${k}.txt`, import.meta.url), "utf8");
const insurers: ContractInsurer[] = [
  {
    id: "s8",
    nome: "S8 Garante",
    brands: ["cordial", "morar"],
    active: true,
    clauseTemplate: "S8 GARANTE valor mensal {{seguro_valor_mensal}}.",
  },
  {
    id: "sf",
    nome: "Seu Fiador",
    brands: ["cordial", "morar"],
    active: true,
    clauseTemplate:
      "SEU FIADOR total {{seguro_valor_total}} em {{seguro_parcelas}} parcelas de {{seguro_valor_mensal}}.",
  },
  {
    id: "mg",
    nome: "MagniCred",
    brands: ["cordial", "morar"],
    active: false,
    clauseTemplate: "MAGNICRED",
  },
];
const party = { label: "x", qualificacao: "FULANO DE TAL, brasileiro, solteiro, motorista, CPF 1" };
const base = (over: Partial<ContractData> = {}): ContractData => ({
  brand: "morar",
  guarantee: "seguro_fianca",
  locador: party,
  locatarios: [party],
  fiadores: [],
  imovelEndereco: "Rua A, n° 1",
  matricula: "123",
  bensFiadores: "",
  dataInicio: "2026-12-01",
  dataAssinatura: "2026-11-23",
  valorAluguel: 1700,
  valorCaucao: null,
  insurer: insurers[0] ?? null,
  seguroValorMensal: 94,
  seguroParcelas: 12,
  ...over,
});

describe("geração de contrato", () => {
  it("usa a cláusula da seguradora escolhida com o valor do contrato", () => {
    const t = fillContract(tpl("morar-seguro_fianca"), base());
    expect(t).toContain("S8 GARANTE valor mensal R$ 94,00 (noventa e quatro reais).");
    expect(t).not.toContain("SEU FIADOR");
    expect(t).toContain("MORAR IMÓVEIS");
  });
  it("Seu Fiador: total = mensal × parcelas", () => {
    const t = fillContract(
      tpl("cordial-seguro_fianca"),
      base({ brand: "cordial", insurer: insurers[1] ?? null, seguroValorMensal: 221.1 }),
    );
    expect(t).toContain(
      "total R$ 2.653,20 (dois mil seiscentos e cinquenta e três reais e vinte centavos) em 12 parcelas de R$ 221,10",
    );
    expect(t).toContain("CORDIAL IMÓVEIS LTDA");
  });
  it("seguradora inativa não aparece para escolha", () => {
    expect(insurersForBrand(insurers, "morar").map((i) => i.nome)).toEqual([
      "S8 Garante",
      "Seu Fiador",
    ]);
  });
  it("aluguel e data por extenso", () => {
    const t = fillContract(tpl("morar-caucao"), base({ guarantee: "caucao", valorCaucao: 6600 }));
    expect(t).toContain("R$ 1.700,00 (mil e setecentos reais) a título de aluguel");
    expect(t).toContain("caução o valor de R$ 6.600,00 (seis mil e seiscentos reais)");
    expect(t).toContain("contados a partir de 01 de dezembro de 2026");
    expect(missingFields(t)).toEqual([]);
  });
  it("bloqueia contrato com campo faltando e nunca deixa xxx", () => {
    for (const k of [
      "cordial-fiador",
      "cordial-caucao",
      "cordial-seguro_fianca",
      "morar-fiador",
      "morar-caucao",
      "morar-seguro_fianca",
    ]) {
      expect(tpl(k)).not.toMatch(/\bxxx+\b/i);
    }
    const t = fillContract(
      tpl("morar-fiador"),
      base({ guarantee: "fiador", locador: { label: "", qualificacao: qualify({ nome: "Ana" }) } }),
    );
    expect(missingFields(t)).toEqual(
      expect.arrayContaining([
        "CPF",
        "bens oferecidos pelos fiadores",
        "fiador(es)/principal(is) pagador(es)",
      ]),
    );
  });
  it("não repete a cidade quando o modelo já a traz", () => {
    const t = fillContract(tpl("cordial-caucao"), base({ brand: "cordial", guarantee: "caucao", valorCaucao: 1, imovelEndereco: "Rua A, n° 1, na cidade de Santa Rosa, RS" }));
    expect(t).toContain("Rua A, n° 1, na cidade de Santa Rosa, RS, para fim");
    expect(t).not.toContain("Santa Rosa, RS, na cidade de Santa Rosa");
  });
  it("sem seguradora escolhida, pede a seguradora", () => {
    expect(
      missingFields(fillContract(tpl("morar-seguro_fianca"), base({ insurer: null }))),
    ).toContain("seguradora contratada");
  });
  it("extenso", () => {
    expect(reaisPorExtenso(2900)).toBe("dois mil e novecentos reais");
    expect(reaisPorExtenso(935)).toBe("novecentos e trinta e cinco reais");
    expect(reaisPorExtenso(1001)).toBe("mil e um reais");
  });
});
