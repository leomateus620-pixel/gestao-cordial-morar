import { describe, expect, it } from "bun:test";
import { parseKnownNumber, sameValue } from "./payload-diff";

describe("comparação numérica por formato conhecido", () => {
  it("não confunde 10.5 com 105", () => {
    expect(sameValue(10.5, 105)).toBe(false);
  });
  it("aceita vírgula decimal brasileira", () => {
    expect(sameValue(10.5, "10,50")).toBe(true);
    expect(sameValue("1.500,00", 1500)).toBe(true);
  });
  it("ponto de milhar e ponto decimal", () => {
    expect(parseKnownNumber("1.500")).toBe(1500);
    expect(parseKnownNumber("1500.50")).toBe(1500.5);
    expect(sameValue("R$ 450.000", "450000,00")).toBe(true);
  });
  it("zero, vazio e nulo são distintos de zero", () => {
    expect(sameValue(0, "")).toBe(false);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue("", null)).toBe(true);
  });
  it("identificador com zero à esquerda não vira número", () => {
    expect(sameValue("0123", 123)).toBe(false);
  });
});
