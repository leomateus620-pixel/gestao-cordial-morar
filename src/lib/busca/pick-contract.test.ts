import { describe, it, expect } from "vitest";
import { pickContract } from "./busca.server";

describe("pickContract", () => {
  it("prefere o contrato ativo", () => {
    expect(
      pickContract([
        { id: "novo-encerrado", status: "encerrado", created_at: "2026-10-01" },
        { id: "ativo", status: "ativo", created_at: "2026-01-01" },
      ]),
    ).toBe("ativo");
  });
  it("sem ativo, usa o mais recente", () => {
    expect(
      pickContract([
        { id: "a", status: "encerrado", created_at: "2025-01-01" },
        { id: "b", status: "pendente_assinatura", created_at: "2026-01-01" },
      ]),
    ).toBe("b");
  });
  it("sem contrato, nenhum destino", () => {
    expect(pickContract([])).toBeUndefined();
  });
});
