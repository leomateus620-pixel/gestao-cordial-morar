import { describe, expect, it } from "vitest";
import {
  flattenAddress,
  normalizeRemoteImages,
  normalizeRemoteProperty,
  parseDecimal,
  parseInteger,
} from "./import-normalizers";
import { matchProperty, type LocalCandidate } from "./dedupe";

describe("parseDecimal", () => {
  it("aceita vírgula decimal e separador de milhar", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("450000,00")).toBe(450000);
    expect(parseDecimal("1,234.56")).toBe(1234.56);
    expect(parseDecimal("R$ 320.000")).toBe(320000);
  });

  it("não inventa zero para vazio ou inválido", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal("-")).toBeNull();
    expect(parseInteger(undefined)).toBeNull();
  });
});

describe("normalizeRemoteProperty", () => {
  it("achata endereço em array e mapeia campos essenciais", () => {
    const remote = {
      codigoImovel: "3584808",
      referenciaImovel: "925",
      finalidade: "Locação",
      tipoImovel: "Sala Comercial",
      endereco: [{ bairro: "Bairro Centro", cidade: "Santa Rosa", uf: "RS", cep: "98900-000" }],
      valorImovel: "1.500,00",
      areaPrivativa: "45,5",
      dormitorios: "",
      garagem: "1",
    };
    const normalized = normalizeRemoteProperty("cordial", "3584808", remote);
    expect(normalized.operacao).toBe("aluguel");
    expect(normalized.finalidade).toBe("locacao");
    expect(normalized.cidade).toBe("Santa Rosa");
    expect(normalized.valor).toBe(1500);
    expect(normalized.areaPrincipal).toBe(45.5);
    expect(normalized.areaTipo).toBe("privativa");
    expect(normalized.dormitorios).toBeNull();
    expect(normalized.vagas).toBe(1);
  });

  it("flattenAddress não perde campos da raiz", () => {
    const flat = flattenAddress({ endereco: { bairro: "Centro" }, cidade: "Santa Rosa" });
    expect(flat["bairro"]).toBe("Centro");
    expect(flat["cidade"]).toBe("Santa Rosa");
  });
});

describe("normalizeRemoteImages", () => {
  it("ordena por destaque e ignora URLs inválidas", () => {
    const images = normalizeRemoteImages([
      { url: "https://x/1.jpg", ordem: 2 },
      { url: "not-a-url" },
      { url: "https://x/2.jpg", ordem: 1, destaque: "sim" },
    ]);
    expect(images).toHaveLength(2);
    expect(images[0]?.url).toBe("https://x/2.jpg");
    expect(images[0]?.isCover).toBe(true);
  });

  it("promove a primeira imagem a capa quando o provedor não informa destaque", () => {
    const images = normalizeRemoteImages([{ url: "https://x/1.jpg" }, { url: "https://x/2.jpg" }]);
    expect(images[0]?.isCover).toBe(true);
    expect(images[1]?.isCover).toBe(false);
  });
});

describe("matchProperty", () => {
  const base: LocalCandidate = {
    id: "local-1",
    carteira: "cordial",
    source: "cordial_website",
    source_property_id: "3584808",
    codigo: "925",
    referencia: null,
    operacao: "aluguel",
    tipo: "Sala Comercial",
    cidade: "Santa Rosa",
    bairro: "Bairro Centro",
    logradouro: null,
    numero: null,
    valor: 1500,
    area_principal: 45.5,
  };
  const remote = normalizeRemoteProperty("cordial", "3584808", {
    referenciaImovel: "925",
    finalidade: "Locação",
    tipoImovel: "Sala Comercial",
    cidade: "Santa Rosa",
    bairro: "Bairro Centro",
    valorImovel: "1500",
    areaPrivativa: "45,5",
  });

  it("liga os registros existentes pelo código externo, sem duplicar", () => {
    const result = matchProperty("cordial", remote, [base]);
    expect(result.status).toBe("exact_match");
    expect(result.propertyId).toBe("local-1");
  });

  it("usa a referência quando o código externo ainda não foi gravado", () => {
    const result = matchProperty("cordial", remote, [{ ...base, source_property_id: null }]);
    expect(result.status).toBe("exact_match");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("marca como ambíguo quando há mais de um candidato equivalente", () => {
    const result = matchProperty("cordial", remote, [
      { ...base, id: "a", source_property_id: null },
      { ...base, id: "b", source_property_id: null },
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.propertyId).toBeNull();
    expect(result.alternatives).toHaveLength(2);
  });

  it("nunca mescla imóvel da Morar com cadastro da Cordial", () => {
    const morar = normalizeRemoteProperty("morar", "999", { referenciaImovel: "925" });
    const result = matchProperty("morar", morar, [base]);
    expect(result.status).toBe("new");
  });

  it("cria novo quando não há correspondência segura", () => {
    const other = normalizeRemoteProperty("cordial", "111", { referenciaImovel: "777", cidade: "Ijuí" });
    expect(matchProperty("cordial", other, [base]).status).toBe("new");
  });
});
