import { describe, expect, it } from "vitest";
import { normalizeTipoImovel } from "./atendimentos";
import { atendimentoTipoImovelOptions, atendimentoTipoImovelLabel } from "@/types/atendimento";
import { propertyTypeOptions } from "@/types/client";

describe("Kitnet no tipo de imóvel do atendimento", () => {
  it("reconhece variações de kitnet", () => {
    for (const v of ["kitnet", "Kitinete", "quitinete", "KITNET"]) expect(normalizeTipoImovel(v)).toBe("kitnet");
  });
  it("mantém os demais tipos", () => {
    expect(normalizeTipoImovel("casa")).toBe("casa");
    expect(normalizeTipoImovel("apartamento")).toBe("apartamento");
    expect(normalizeTipoImovel("sitio_chacara")).toBe("sitio_chacara");
    expect(normalizeTipoImovel("outro")).toBe("outro");
  });
  it("aparece logo após Apartamento com rótulo Kitnet", () => {
    const i = atendimentoTipoImovelOptions.findIndex((o) => o.value === "apartamento");
    expect(atendimentoTipoImovelOptions[i + 1].value).toBe("kitnet");
    expect(atendimentoTipoImovelLabel("kitnet")).toBe("Kitnet");
    expect(propertyTypeOptions.some((o) => o.value === "kitnet")).toBe(true);
  });
});
