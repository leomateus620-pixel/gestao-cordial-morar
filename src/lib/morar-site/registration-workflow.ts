/** Pure orchestration: own-channel intent is durable before registration completes. */
export type OwnedMorarDecision = {
  ok: boolean;
  publicId?: string;
  state?: string;
  active?: boolean;
  pendingReview?: boolean;
  reason?: string;
  conflict?: boolean;
  confirmationError?: boolean;
};

export async function prepareOwnedMorarRegistration(dependencies: {
  persistIntent: () => Promise<OwnedMorarDecision>;
  ensureAgency: () => Promise<{ status: string; id?: string; reason?: string }>;
}) {
  const decision = await dependencies.persistIntent();
  if (!decision?.ok)
    throw new Error(
      "A intenção de publicação Morar não foi persistida. Atualize o cadastro e tente novamente.",
    );
  const agency = await dependencies.ensureAgency();
  if (agency.status !== "created" && agency.status !== "exists") {
    throw new Error(
      agency.reason || "O agenciamento necessário à publicação Morar ficou pendente.",
    );
  }
  return { decision, agency };
}
