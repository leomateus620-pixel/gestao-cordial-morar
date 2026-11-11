import { describe, expect, it } from "vitest";
import { sameMoneyValue, syncMoneyText } from "./money-input-sync";

describe("syncMoneyText", () => {
  it("mostra o novo aluguel quando o proporcional é aplicado (800,00 → 670,97)", () => {
    expect(syncMoneyText("800,00", 670.97)).toBe("670,97");
  });

  it("não reformata enquanto a pessoa digita", () => {
    expect(syncMoneyText("1.2", 1.2)).toBe("1.2");
    expect(syncMoneyText("1.", NaN)).toBe("1.");
    expect(syncMoneyText("1.234,5", 1234.5)).toBe("1.234,5");
  });

  it("mantém o campo vazio quando a pessoa apaga tudo", () => {
    expect(syncMoneyText("", NaN)).toBe("");
  });

  it("preenche um campo vazio que recebe valor de fora", () => {
    expect(syncMoneyText("", 1500)).toBe("1.500,00");
  });
});

describe("sameMoneyValue", () => {
  it("trata ausência de valor como igual a si mesma", () => {
    expect(sameMoneyValue(NaN, NaN)).toBe(true);
    expect(sameMoneyValue(NaN, 0)).toBe(false);
    expect(sameMoneyValue(800, 670.97)).toBe(false);
  });
});
