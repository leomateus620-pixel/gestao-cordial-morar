import { describe, expect, it } from "vitest";
import {
  effectiveCompetence,
  formatCompetenceLong,
  parseCompetenciaParam,
  rentalSearch,
  type RentalSearch,
  shiftCompetence,
} from "./competence-nav";
import {
  buildCompetenceBadges,
  countPending,
  hasPending,
  type CompetenceRows,
} from "./competence-status";
import { friendlyWorkflowError } from "./workflow-errors";
import { guaranteePerson } from "./workspace-guarantee";

const NOW = new Date("2026-11-25T12:00:00Z");

describe("competência na URL", () => {
  it("aceita AAAA-MM válido", () => expect(parseCompetenciaParam("2026-10")).toBe("2026-10"));
  it("descarta inválido", () => {
    expect(parseCompetenciaParam("2026-13")).toBeUndefined();
    expect(parseCompetenciaParam("11/2026")).toBeUndefined();
    expect(parseCompetenciaParam(202611)).toBeUndefined();
  });
  it("ausente vira mês atual de São Paulo", () => expect(effectiveCompetence(undefined, NOW)).toBe("2026-11"));
  it("virada de mês segue São Paulo, não UTC", () =>
    expect(effectiveCompetence(undefined, new Date("2026-12-01T02:00:00Z"))).toBe("2026-11"));
  it("anterior/próximo atravessa o ano", () => {
    expect(shiftCompetence("2026-12", 1)).toBe("2027-01");
    expect(shiftCompetence("2027-01", -1)).toBe("2026-12");
  });
  it("rótulo por extenso", () => expect(formatCompetenceLong("2026-11")).toBe("novembro de 2026"));
});

describe("rentalSearch", () => {
  const prev: RentalSearch = { corretorId: "c", periodo: "mes", imobiliaria: "morar", status: "ativos", competencia: "2026-10" };
  it("abrir pastinha mantém competência e filtros", () =>
    expect(rentalSearch(prev, { id: "x" }, NOW)).toEqual({ ...prev, id: "x" }));
  it("fechar pastinha remove id, formulario e etapa", () =>
    expect(rentalSearch({ ...prev, id: "x", formulario: "f", etapa: "vistorias" }, {}, NOW)).toEqual(prev));
  it("abrir formulário não herda id", () =>
    expect(rentalSearch({ ...prev, id: "x" }, { formulario: "f" }, NOW)).toEqual({ ...prev, formulario: "f" }));
  it("vistorias leva id e etapa", () =>
    expect(rentalSearch(prev, { id: "x", etapa: "vistorias" }, NOW)).toEqual({ ...prev, id: "x", etapa: "vistorias" }));
  it("mudar filtro mantém competência", () =>
    expect(rentalSearch(prev, { imobiliaria: "cordial" }, NOW).competencia).toBe("2026-10"));
  it("mês atual não vai para a URL", () =>
    expect(rentalSearch(prev, { competencia: "2026-11" }, NOW).competencia).toBeUndefined());
  it("trocar na pastinha mantém a pastinha aberta", () =>
    expect(rentalSearch({ ...prev, id: "x" }, { competencia: "2026-09", id: "x" }, NOW)).toEqual({ ...prev, id: "x", competencia: "2026-09" }));
});

describe("selos da competência", () => {
  const contracts = [
    { id: "a", brand: "cordial", status: "ativo" },
    { id: "b", brand: "morar", status: "pendente_assinatura" },
    { id: "c", brand: "cordial", status: "encerrado" },
  ];
  const rows: CompetenceRows = {
    emissions: [{ contract_id: "a", tipo: "recibo", status: "emitido" }, { contract_id: "b", tipo: "recibo", status: "erro" }],
    boletos: [{ contract_id: "a", ambiente: "producao", estado: "registrado" }, { contract_id: "b", ambiente: "sandbox", estado: "registrado" }],
    nfse: [{ contract_id: "a", status: "teste_ok" }],
  };
  const off = { cordial: { boletoAtivo: false, nfModoTeste: true }, morar: { boletoAtivo: false, nfModoTeste: true } };
  it("trava de boleto fechada esconde boleto; NF teste é informativa", () => {
    const b = buildCompetenceBadges(contracts, rows, off, true);
    expect(b.a?.map((x) => x.label)).toEqual(["Recibo emitido", "NF teste"]);
    expect(hasPending(b.a)).toBe(false);
    expect(countPending(b)).toBe(1);
  });
  it("contrato encerrado não recebe selo", () => expect(buildCompetenceBadges(contracts, rows, off, true).c).toBeUndefined());
  it("produção liberada: sandbox não conta e falta de boleto é pendente", () => {
    const on = { cordial: { boletoAtivo: true, nfModoTeste: false }, morar: { boletoAtivo: true, nfModoTeste: false } };
    const b = buildCompetenceBadges(contracts, rows, on, true);
    expect(b.a?.map((x) => x.label)).toEqual(["Recibo emitido", "Boleto emitido", "NF pendente"]);
    expect(b.b?.find((x) => x.kind === "boleto")?.state).toBe("pendente");
  });
  it("sem permissão de NF, sem selo de NF", () =>
    expect(buildCompetenceBadges(contracts, rows, off, false).a?.some((x) => x.kind === "nf")).toBe(false));
});

describe("erros do fluxo do contrato", () => {
  it("troca mensagem crua do banco", () =>
    expect(friendlyWorkflowError(new Error("cannot call populate_composite on a scalar"), "conferir")).toBe(
      "Não foi possível conferir o contrato. Tente novamente; se persistir, avise o suporte.",
    ));
  it("mantém mensagens próprias", () => {
    expect(friendlyWorkflowError(new Error("Informe o fiador."), "conferir")).toBe("Informe o fiador.");
    expect(friendlyWorkflowError(new Error("Salve a revisão atual antes de conferir."), "conferir")).toBe(
      "Salve a revisão atual antes de conferir.",
    );
  });
  it("rede e ações diferentes", () => {
    expect(friendlyWorkflowError(new TypeError("Failed to fetch"), "anexar")).toMatch(/^Não foi possível anexar/);
    expect(friendlyWorkflowError(null, "gerar")).toMatch(/^Não foi possível gerar/);
    expect(friendlyWorkflowError(new Error('null value in column "x" violates not-null constraint'), "salvar")).toMatch(/^Não foi possível salvar/);
  });
});

describe("garantia sem fiador", () => {
  it("omite person quando não há fiador", () => {
    expect(guaranteePerson(undefined)).toEqual({});
    expect("person" in guaranteePerson(null)).toBe(false);
    expect(guaranteePerson({ nome: "F" })).toEqual({ person: { nome: "F" } });
  });
});
