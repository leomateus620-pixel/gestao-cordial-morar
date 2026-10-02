import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyDateFromCreatedAt,
  agencyFinalidadeFromProperty,
  isRegistrationIncomplete,
  resolveAutoAgencyBroker,
  shouldAlertIncomplete,
  type RegistrationState,
} from "./registration-rules.ts";

const roles: Record<string, string[]> = {
  corretor: ["corretor"],
  admin: ["admin"],
  secretaria: ["secretaria"],
};
const rolesOf = (id: string) => roles[id] ?? [];

test("corretor do imóvel tem prioridade", () => {
  assert.equal(
    resolveAutoAgencyBroker({ propertyCorretorId: "x", createdBy: "corretor", publisherId: "admin", rolesOf }),
    "x",
  );
});

test("sem corretor: criador corretor, senão quem publicou se for corretor", () => {
  assert.equal(
    resolveAutoAgencyBroker({ propertyCorretorId: null, createdBy: "corretor", publisherId: "admin", rolesOf }),
    "corretor",
  );
  assert.equal(
    resolveAutoAgencyBroker({ propertyCorretorId: null, createdBy: null, publisherId: "corretor", rolesOf }),
    "corretor",
  );
});

test("admin ou secretária que publicam nunca viram responsáveis", () => {
  for (const who of ["admin", "secretaria"]) {
    assert.equal(
      resolveAutoAgencyBroker({ propertyCorretorId: null, createdBy: who, publisherId: who, rolesOf }),
      null,
    );
  }
});

test("finalidade vem do imóvel", () => {
  assert.equal(agencyFinalidadeFromProperty("locacao", "aluguel"), "aluguel");
  assert.equal(agencyFinalidadeFromProperty("temporada", null), "aluguel");
  assert.equal(agencyFinalidadeFromProperty("venda", "venda"), "venda");
  assert.equal(agencyFinalidadeFromProperty(null, "aluguel"), "aluguel");
});

test("data do agenciamento no dia de São Paulo da criação", () => {
  // 22:30 BRT de 01/10 = 01:30 UTC de 02/10
  assert.equal(agencyDateFromCreatedAt("2026-10-02T01:30:00.000Z"), "2026-10-01");
});

const base: RegistrationState = {
  source: "gestao_cordial",
  isDraft: false,
  archived: false,
  registrationCompletedAt: "2026-10-03T10:00:00Z",
  hasPublication: true,
  hasAgenciamento: true,
  createdAt: "2026-10-03T10:00:00Z",
};

test("rascunho e falta de agenciamento contam como pendente", () => {
  assert.equal(isRegistrationIncomplete(base), false);
  assert.equal(isRegistrationIncomplete({ ...base, isDraft: true }), true);
  assert.equal(isRegistrationIncomplete({ ...base, hasAgenciamento: false }), true);
  assert.equal(
    isRegistrationIncomplete({ ...base, registrationCompletedAt: null, hasPublication: false }),
    true,
  );
  // Concluído só no catálogo (sem publicar) não é pendente.
  assert.equal(isRegistrationIncomplete({ ...base, hasPublication: false }), false);
  assert.equal(isRegistrationIncomplete({ ...base, isDraft: true, archived: true }), false);
  assert.equal(isRegistrationIncomplete({ ...base, isDraft: true, source: "cordial_api" }), false);
});

test("alerta só depois de 30 minutos, nunca para concluído ou arquivado", () => {
  const draft = { ...base, isDraft: true };
  assert.equal(shouldAlertIncomplete(draft, new Date("2026-10-03T10:29:00Z")), false);
  assert.equal(shouldAlertIncomplete(draft, new Date("2026-10-03T10:31:00Z")), true);
  assert.equal(shouldAlertIncomplete(base, new Date("2026-10-03T12:00:00Z")), false);
  assert.equal(shouldAlertIncomplete({ ...draft, archived: true }, new Date("2026-10-03T12:00:00Z")), false);
  // Casos antigos (antes da mudança) não geram aviso.
  assert.equal(
    shouldAlertIncomplete({ ...draft, createdAt: "2026-10-01T10:00:00Z" }, new Date("2026-10-03T12:00:00Z")),
    false,
  );
});
