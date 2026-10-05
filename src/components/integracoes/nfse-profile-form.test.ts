import test from "node:test";
import assert from "node:assert/strict";
import {
  fiscalProfileApprovalInput,
  parseProfileDraft,
  profileToDraft,
} from "./nfse-profile-form.ts";
import type { FiscalProfile } from "../../lib/nfse/fiscal-profile";

const approvedFixture: FiscalProfile = {
  operation: "administracao",
  tomadorPapel: "proprietario",
  valorOrigem: "valor_revisado",
  elegibilidade: "revisao_manual",
  descricao: "Serviço da fixture sanitizada",
  regime: "Regime da fixture",
  localPrestacao: "8845",
  layout: "35/2021",
  regraFatoGerador: "revisao_manual",
  retencoes: { ir: 0, inss: 0, contribuicaoSocial: 0, rps: 0, pis: 0, cofins: 0, iss: 0 },
  ibsCbs: false,
  finNFSe: null,
  indFinal: null,
  tpOper: null,
  approvalReference: "Fixture sanitizada para teste local",
  productionAuthorization: null,
  automation: "assistida",
};

test("an empty administrative profile has no implied fiscal approval or tax choices", () => {
  assert.deepEqual(profileToDraft(null), {});
  assert.equal(parseProfileDraft({}).success, false);
});

test("approved zero retentions survive form round-trip without inventing production authorization", () => {
  const result = parseProfileDraft(profileToDraft(approvedFixture));
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, approvedFixture);
});

test("clearing a retention does not silently interpret the missing value as zero", () => {
  const draft = profileToDraft(approvedFixture);
  draft.retencao_iss = "";
  assert.equal(parseProfileDraft(draft).success, false);
});

test("IBS/CBS applicability must be explicitly selected", () => {
  const draft = profileToDraft(approvedFixture);
  delete draft.ibsCbs;
  assert.equal(parseProfileDraft(draft).success, false);
});

test("loading an existing approved profile never implicitly reapproves a settings save", () => {
  assert.deepEqual(
    fiscalProfileApprovalInput({ isAdmin: true, confirmed: false, profile: approvedFixture }),
    {},
  );
});

test("approval payload requires an administrator, explicit confirmation, and a complete profile", () => {
  assert.deepEqual(
    fiscalProfileApprovalInput({ isAdmin: true, confirmed: true, profile: approvedFixture }),
    { fiscalProfile: approvedFixture, aprovarPerfil: true },
  );
  assert.deepEqual(
    fiscalProfileApprovalInput({ isAdmin: false, confirmed: true, profile: approvedFixture }),
    {},
  );
  assert.deepEqual(
    fiscalProfileApprovalInput({ isAdmin: true, confirmed: true, profile: null }),
    {},
  );
});
