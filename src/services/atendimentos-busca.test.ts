import { describe, expect, it } from "vitest";
import { atendimentoMatchesSearch } from "./atendimentos";
import type { Atendimento } from "@/types/atendimento";

const base = { clienteNome: "Graziela Thais Kunkel", telefone: "(47) 99123-4567" } as Atendimento;

describe("busca de atendimentos", () => {
  it("encontra pelo nome sem acento", () => {
    expect(atendimentoMatchesSearch(base, "graziela")).toBe(true);
  });
  it("encontra telefone digitado só com números", () => {
    expect(atendimentoMatchesSearch(base, "47991234567")).toBe(true);
    expect(atendimentoMatchesSearch(base, "991234")).toBe(true);
  });
  it("não encontra número inexistente", () => {
    expect(atendimentoMatchesSearch(base, "11112222")).toBe(false);
  });
});
