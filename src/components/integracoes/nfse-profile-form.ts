import { fiscalProfileSchema, type FiscalProfile } from "../../lib/nfse/fiscal-profile";

export type FiscalProfileDraft = Record<string, string>;

/** Merely loading an approved profile must never turn an ordinary settings save into approval. */
export function fiscalProfileApprovalInput(input: {
  isAdmin: boolean;
  confirmed: boolean;
  profile: FiscalProfile | null;
}): { fiscalProfile?: FiscalProfile; aprovarPerfil?: true } {
  return input.isAdmin && input.confirmed && input.profile
    ? { fiscalProfile: input.profile, aprovarPerfil: true }
    : {};
}
export const retentionFields = [
  ["ir", "IR"],
  ["inss", "INSS"],
  ["contribuicaoSocial", "Contribuição social"],
  ["rps", "RPS (retenção do layout)"],
  ["pis", "PIS"],
  ["cofins", "COFINS"],
  ["iss", "ISS"],
] as const;
export function profileToDraft(profile: FiscalProfile | null): FiscalProfileDraft {
  if (!profile) return {};
  const result: FiscalProfileDraft = {};
  for (const [key, value] of Object.entries(profile)) {
    if (key === "retencoes") continue;
    result[key] = value == null ? "" : String(value);
  }
  for (const [key] of retentionFields) result[`retencao_${key}`] = String(profile.retencoes[key]);
  return result;
}

export function parseProfileDraft(draft: FiscalProfileDraft) {
  return fiscalProfileSchema.safeParse({
    ...draft,
    ibsCbs: draft.ibsCbs === "true" ? true : draft.ibsCbs === "false" ? false : undefined,
    retencoes: Object.fromEntries(
      retentionFields.map(([key]) => [
        key,
        draft[`retencao_${key}`]?.trim()
          ? Number(draft[`retencao_${key}`].replace(",", "."))
          : undefined,
      ]),
    ),
    finNFSe: draft.finNFSe || null,
    indFinal: draft.indFinal || null,
    tpOper: draft.tpOper || null,
    productionAuthorization: draft.productionAuthorization?.trim() || null,
    automation: "assistida",
    regraFatoGerador: "revisao_manual",
  });
}
