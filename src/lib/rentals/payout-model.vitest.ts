import { describe, expect, it } from "vitest";
import { buildPayoutLines, sumLines, checkApproval, canTransition, isRepassado } from "./payout-model";

describe("repasse", () => {
  it("aluguel 2000 + condomínio 300 − honorários 200 + ajuste repassável 50 − desconto proprietário 30 = 2120", () => {
    const l = buildPayoutLines({
      aluguelCentavos: 200000, condominioCentavos: 30000, honorariosCentavos: 20000,
      ajustesInquilino: [{ descricao: "Multa", tipo: "acrescimo", valorCentavos: 5000, repassarProprietario: true }, { descricao: "Juros", tipo: "acrescimo", valorCentavos: 999 }],
      ajustesProprietario: [{ descricao: "Reparo", tipo: "desconto", valorCentavos: 3000 }],
    });
    expect(sumLines(l)).toBe(212000);
    expect(l.find((x) => x.origem === "honorarios")?.destinatario).toBe("imobiliaria");
  });
  const base = { previstoCentavos: 1000, aprovadoCentavos: 1000, recebidoCentavos: 2000, destinoVersao: 2, destinoVersaoAtual: 2 };
  it("bloqueia acima do recebido", () => expect(checkApproval({ ...base, aprovadoCentavos: 2001 }).ok).toBe(false));
  it("bloqueia zero/negativo", () => expect(checkApproval({ ...base, aprovadoCentavos: 0 }).ok).toBe(false));
  it("troca de conta invalida aprovação", () => expect(checkApproval({ ...base, destinoVersaoAtual: 3 }).ok).toBe(false));
  it("sem recebimento não aprova", () => expect(checkApproval({ ...base, recebidoCentavos: null }).ok).toBe(false));
  it("parcial exige motivo", () => {
    expect(checkApproval({ ...base, aprovadoCentavos: 500 }).ok).toBe(false);
    expect(checkApproval({ ...base, aprovadoCentavos: 500, decisaoMotivo: "parcial aprovado" }).ok).toBe(true);
  });
  it("não pula de previsto para pago", () => expect(canTransition("previsto", "pago_manual")).toBe(false));
  it("só confirmado é repassado", () => { expect(isRepassado("pago_manual")).toBe(false); expect(isRepassado("confirmado")).toBe(true); });
});
