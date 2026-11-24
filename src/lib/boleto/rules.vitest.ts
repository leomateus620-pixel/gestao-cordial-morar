import { describe, expect, it } from "vitest";
import { tenantTotal, tenantTotalSourceFor } from "@/lib/rentals/tenant-total";
import { computeProportionalRent } from "@/lib/rentals/receipt-proportional";
import { buildBoletoPreview } from "./preview";
import {
  boletoDueDate,
  boletoPermissions,
  lastBusinessDay,
  normalizePagador,
  parseEncargos,
  resolveVencimento,
} from "./rules";

describe("total do inquilino", () => {
  it("aluguel 2.000 + 100 − 50 = 2.050; comissão de 200 não entra", () => {
    const src = tenantTotalSourceFor({ valorMensal: 2000, seguroValorMensal: 0 }, "2026-11", {
      recurring: [
        {
          id: "a",
          tipo: "acrescimo",
          descricao: "Água",
          valor: 100,
          repassarProprietario: false,
          inicioCompetencia: "2026-01",
          fimCompetencia: null,
          ativo: true,
        },
        {
          id: "b",
          tipo: "desconto",
          descricao: "Pintura",
          valor: 50,
          repassarProprietario: true,
          inicioCompetencia: "2026-11",
          fimCompetencia: "2026-11",
          ativo: true,
        },
        {
          id: "c",
          tipo: "acrescimo",
          descricao: "Antigo",
          valor: 999,
          repassarProprietario: false,
          inicioCompetencia: "2025-01",
          fimCompetencia: "2025-12",
          ativo: true,
        },
      ],
    });
    expect(tenantTotal(src).totalCentavos).toBe(205000);
  });
  it("usa o recibo emitido da competência (inclusive aluguel proporcional)", () => {
    const prop = computeProportionalRent({
      valorMensal: 2000,
      competencia: "2026-02",
      kind: "entrada",
      dias: 10,
    });
    if (!prop.ok) throw new Error("prop");
    const src = tenantTotalSourceFor({ valorMensal: 2000 }, "2026-02", {
      receiptValores: {
        aluguel: prop.valor,
        condominio: 300,
        iptu: 0,
        seguroFianca: 0,
        honorarios: 200,
        ajustesInquilino: [],
      },
    });
    expect(src.fonte).toBe("recibo");
    expect(tenantTotal(src).totalCentavos).toBe(Math.round(prop.valor * 100) + 30000);
  });
});

describe("vencimento", () => {
  it("dia 31 vira o último dia do mês (fevereiro 28/29)", () => {
    expect(boletoDueDate("2026-02", 31)).toBe("2026-02-28");
    expect(boletoDueDate("2028-02", 31)).toBe("2028-02-29");
    expect(boletoDueDate("2026-04", 31)).toBe("2026-04-30");
    expect(boletoDueDate("2026-11", 10)).toBe("2026-11-10");
  });
  it("vencimento passado exige nova data futura e registra a alteração", () => {
    const base = { competencia: "2026-11", diaVencimento: 10, today: "2026-11-19" };
    expect(resolveVencimento(base)).toMatchObject({ ok: false, code: "vencimento_passado" });
    expect(resolveVencimento({ ...base, novoVencimento: "2026-11-19" })).toMatchObject({
      ok: false,
      code: "vencimento_invalido",
    });
    expect(resolveVencimento({ ...base, novoVencimento: "2026-11-25" })).toEqual({
      ok: true,
      vencimento: "2026-11-25",
      original: "2026-11-10",
      alterado: true,
    });
    expect(resolveVencimento({ ...base, today: "2026-11-05" })).toEqual({
      ok: true,
      vencimento: "2026-11-10",
      original: "2026-11-10",
      alterado: false,
    });
    expect(
      resolveVencimento({ ...base, today: "2026-11-05", novoVencimento: "2026-11-20" }).ok,
    ).toBe(false);
  });
  it("último dia útil pula o fim de semana", () => {
    expect(lastBusinessDay("2026-11-16")).toBe("2026-11-13");
  });
});

describe("prévia e bloqueios", () => {
  const contract = {
    id: "c",
    brand: "cordial",
    status: "ativo",
    diaVencimento: 25,
    proximoVencimento: "2026-11-25",
    valorMensal: 2000,
    seguroValorMensal: 0,
  };
  const pagador = {
    nome: "Fulano",
    documento: "12345678909",
    logradouro: "Rua A",
    numero: "1",
    cidade: "Santa Rosa",
    uf: "RS",
    cep: "98780000",
  };
  const account = { ambiente: "sandbox" as const, encargos: { ativo: false } };
  it("gera snapshot quando tudo está certo", () => {
    const p = buildBoletoPreview({
      contract,
      pagador,
      competencia: "2026-11",
      today: "2026-11-19",
      account,
    });
    expect(p.ok).toBe(true);
    expect(p.snapshot?.total_centavos).toBe(200000);
    expect(p.snapshot?.especieDocumento).toBe("RECIBO");
    expect(p.pagador?.documento).toBe("***.456.789-**");
  });
  it("bloqueia parcela já paga, total zero, pagador incompleto, marca 'ambas' e falta de conta", () => {
    expect(
      buildBoletoPreview({
        contract: { ...contract, proximoVencimento: "2026-12-25" },
        pagador,
        competencia: "2026-11",
        today: "2026-11-19",
        account,
      }).ok,
    ).toBe(false);
    expect(
      buildBoletoPreview({
        contract: { ...contract, valorMensal: 0 },
        pagador,
        competencia: "2026-11",
        today: "2026-11-19",
        account,
      }).bloqueios.join(),
    ).toContain("maior que zero");
    const semCep = buildBoletoPreview({
      contract,
      pagador: { ...pagador, cep: "" },
      competencia: "2026-11",
      today: "2026-11-19",
      account: { ...account, ambiente: "producao" },
    });
    expect(semCep.pendencias).toEqual([{ campo: "CEP", tela: "Imóvel do aluguel" }]);
    expect(
      buildBoletoPreview({
        contract: { ...contract, brand: "ambas" },
        pagador,
        competencia: "2026-11",
        today: "2026-11-19",
        account,
      }).ok,
    ).toBe(false);
    expect(
      buildBoletoPreview({
        contract,
        pagador,
        competencia: "2026-11",
        today: "2026-11-19",
        account: null,
      }).ok,
    ).toBe(false);
  });
  it("vencimento alterado fica no snapshot", () => {
    const p = buildBoletoPreview({
      contract: { ...contract, diaVencimento: 10, proximoVencimento: "2026-11-10" },
      pagador,
      competencia: "2026-11",
      today: "2026-11-19",
      novoVencimento: "2026-11-28",
      account,
    });
    expect(p.snapshot?.vencimento).toEqual({
      data: "2026-11-28",
      original: "2026-11-10",
      alterado: true,
    });
  });
});

describe("pagador, encargos e permissões", () => {
  it("CPF inválido e CNPJ válido", () => {
    expect(
      normalizePagador({
        nome: "A",
        documento: "11111111111",
        logradouro: "R",
        cidade: "C",
        uf: "RS",
        cep: "98780000",
      }).ok,
    ).toBe(false);
    expect(
      normalizePagador({
        nome: "A",
        documento: "11.222.333/0001-81",
        logradouro: "R",
        cidade: "C",
        uf: "RS",
        cep: "98780000",
      }).ok,
    ).toBe(true);
  });
  it("encargos começam desligados e fora da faixa são recusados", () => {
    expect(parseEncargos(undefined).ativo).toBe(false);
    expect(() => parseEncargos({ ativo: true, tipoMulta: "PERCENTUAL", multa: 50 })).toThrow();
  });
  it("só admin e secretaria emitem; responsável do contrato não; revisor Meta nunca", () => {
    expect(boletoPermissions({ admin: true, secretaria: false, metaReviewer: false })).toEqual({
      podeEmitir: true,
      podeGerenciarContas: true,
    });
    expect(boletoPermissions({ admin: false, secretaria: true, metaReviewer: false })).toEqual({
      podeEmitir: true,
      podeGerenciarContas: false,
    });
    expect(
      boletoPermissions({ admin: false, secretaria: false, metaReviewer: false }).podeEmitir,
    ).toBe(false);
    expect(
      boletoPermissions({ admin: true, secretaria: true, metaReviewer: true }).podeEmitir,
    ).toBe(false);
  });
});

import { allowedIssuingBrands, defaultIssuingBrand, resolveIssuingBrand } from "./rules";

describe("conta emissora (contratos ambas)", () => {
  const admin = { admin: true, agencies: [] };
  const secCordial = { admin: false, agencies: ["cordial"] };
  const secDuas = { admin: false, agencies: ["cordial", "morar"] };
  it("admin vê as duas contas num contrato ambas, sem pré-seleção", () => {
    expect(allowedIssuingBrands(admin, "ambas")).toEqual(["cordial", "morar"]);
    expect(defaultIssuingBrand(admin, "ambas")).toBeNull();
  });
  it("secretária com uma marca vê só ela, já marcada", () => {
    expect(allowedIssuingBrands(secCordial, "ambas")).toEqual(["cordial"]);
    expect(defaultIssuingBrand(secCordial, "ambas")).toBe("cordial");
    expect(defaultIssuingBrand(secDuas, "ambas")).toBeNull();
  });
  it("secretária Cordial não emite pela Morar", () => {
    expect(resolveIssuingBrand(secCordial, "ambas", "morar").ok).toBe(false);
    expect(resolveIssuingBrand(secCordial, "ambas", "cordial")).toEqual({ ok: true, brand: "cordial" });
  });
  it("contrato ambas sem escolha fica bloqueado", () => {
    expect(resolveIssuingBrand(admin, "ambas", null).ok).toBe(false);
  });
  it("contrato Cordial usa a própria conta e recusa Morar forçada", () => {
    expect(resolveIssuingBrand(admin, "cordial", null)).toEqual({ ok: true, brand: "cordial" });
    expect(resolveIssuingBrand(admin, "cordial", "morar").ok).toBe(false);
    expect(resolveIssuingBrand(admin, "morar", "cordial").ok).toBe(false);
  });
  it("prévia de contrato ambas grava marca da conta e do contrato no snapshot", () => {
    const p = buildBoletoPreview({
      contract: { id: "c", brand: "ambas", status: "ativo", diaVencimento: 10, proximoVencimento: null, valorMensal: 1000, seguroValorMensal: 0 },
      pagador: {},
      competencia: "2030-05",
      today: "2030-05-01",
      account: { ambiente: "sandbox", encargos: { ativo: false } },
      issuingBrand: "morar",
    });
    expect(p.snapshot?.marca_conta).toBe("morar");
    expect(p.snapshot?.marca_contrato).toBe("ambas");
    expect(p.snapshot?.conta.brand).toBe("morar");
  });
  it("prévia de contrato ambas sem conta escolhida não monta título", () => {
    const p = buildBoletoPreview({
      contract: { id: "c", brand: "ambas", status: "ativo", diaVencimento: 10, proximoVencimento: null, valorMensal: 1000, seguroValorMensal: 0 },
      pagador: {},
      competencia: "2030-05",
      today: "2030-05-01",
      account: null,
      issuingBrand: null,
      issuingBrandMotivo: "Escolha a conta emissora (Cordial ou Morar).",
    });
    expect(p.ok).toBe(false);
    expect(p.snapshot).toBeNull();
    expect(p.bloqueios).toContain("Escolha a conta emissora (Cordial ou Morar).");
  });
  it("produção sem dados do inquilino bloqueia; homologação só avisa", () => {
    const base = {
      contract: { id: "c", brand: "cordial", status: "ativo", diaVencimento: 10, proximoVencimento: null, valorMensal: 1000, seguroValorMensal: 0 },
      pagador: {},
      competencia: "2030-05",
      today: "2030-05-01",
    };
    const prod = buildBoletoPreview({ ...base, account: { ambiente: "producao", encargos: { ativo: false } } });
    const sb = buildBoletoPreview({ ...base, account: { ambiente: "sandbox", encargos: { ativo: false } } });
    expect(prod.ok).toBe(false);
    expect(prod.pendencias.length).toBeGreaterThan(0);
    expect(sb.pendencias).toEqual([]);
    expect(sb.pagadorFicticio).toBe(true);
  });
});
