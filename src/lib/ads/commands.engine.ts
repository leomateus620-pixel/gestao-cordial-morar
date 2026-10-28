import {
  META_AD_STEPS,
  confirmedIds,
  creationStepPayload,
  type MetaAdCommand,
  type MetaAdDraftPayload,
  type MetaAdStep,
  type MetaCommandStep,
  type MetaJson,
} from "./drafts.model";
export interface MetaCreationPort {
  record(step: MetaAdStep, result: MetaCommandStep): Promise<void>;
  create(step: MetaAdStep, payload: Record<string, string>): Promise<{ id: string }>;
  verify(
    step: MetaAdStep,
    id: string,
    ids: Partial<Record<MetaAdStep, string>>,
  ): Promise<Record<string, MetaJson>>;
  finish(state: "done" | "partial" | "uncertain" | "failed", code: string | null): Promise<void>;
}
/** No retries here. Each result and intention is durable before the next network write. */
export async function runPausedCreation(
  command: Pick<MetaAdCommand, "id" | "steps">,
  payload: MetaAdDraftPayload,
  port: MetaCreationPort,
): Promise<void> {
  const ids = confirmedIds(command.steps);
  for (const step of META_AD_STEPS) {
    const previous = command.steps[step];
    if (previous?.state === "done") continue;
    if (previous?.state === "sending" || previous?.state === "uncertain") {
      await port.finish("uncertain", "outcome_uncertain");
      return;
    }
    // A persistence failure here prevents the POST entirely.
    await port.record(step, { state: "sending" });
    let acceptedId: string | undefined;
    try {
      const response = await port.create(step, creationStepPayload(step, payload, command.id, ids));
      if (!/^\d{1,80}$/.test(response?.id ?? ""))
        throw Object.assign(new Error(), { code: "outcome_uncertain" });
      acceptedId = response.id;
      // Preserve the ID BEFORE the confirmation read. A crash can never replay this POST.
      await port.record(step, {
        state: "uncertain",
        id: acceptedId,
        error: "verification_pending",
      });
      const snapshot = await port.verify(step, acceptedId, ids);
      await port.record(step, { state: "done", id: acceptedId, snapshot });
      ids[step] = acceptedId;
    } catch (error) {
      const rawCode =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "outcome_uncertain";
      const uncertain =
        !!acceptedId ||
        rawCode === "outcome_uncertain" ||
        ![
          "no_permission",
          "token_expired",
          "invalid_parameter",
          "rate_limited",
          "conflict",
          "not_configured",
        ].includes(rawCode);
      const code = uncertain
        ? acceptedId
          ? "verification_pending"
          : "outcome_uncertain"
        : rawCode;
      await port.record(step, {
        state: uncertain ? "uncertain" : "failed",
        ...(acceptedId ? { id: acceptedId } : {}),
        error: code,
      });
      await port.finish(
        uncertain ? "uncertain" : Object.keys(ids).length ? "partial" : "failed",
        code,
      );
      return;
    }
  }
  await port.finish("done", null);
}
