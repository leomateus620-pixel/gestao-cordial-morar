import { z } from "zod";

const offsetDate = z.string().datetime({ offset: true });
export const metaAdDraftPayloadSchema = z
  .object({
    name: z.string().trim().min(3).max(150),
    destination: z.enum(["website", "lead_form"]),
    websiteUrl: z
      .url()
      .max(2000)
      .refine((value) => {
        const u = new URL(value);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          !u.searchParams.has("access_token")
        );
      }, "Use um destino HTTPS público, sem credenciais."),
    formId: z
      .string()
      .regex(/^\d{1,80}$/)
      .optional(),
    pageId: z.string().regex(/^\d{1,80}$/),
    country: z.literal("BR"),
    budget: z
      .object({
        kind: z.enum(["daily", "lifetime"]),
        amountMinor: z.string().regex(/^[1-9]\d{0,8}$/, "Informe centavos inteiros (BRL)."),
        currency: z.literal("BRL"),
        startTime: offsetDate,
        endTime: offsetDate.optional(),
      })
      .strict(),
    creative: z
      .object({
        imageHash: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
        title: z.string().trim().min(1).max(100),
        message: z.string().trim().min(1).max(2000),
        callToAction: z.enum(["LEARN_MORE", "CONTACT_US"]),
      })
      .strict(),
    housingConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.destination === "lead_form" && !value.formId)
      ctx.addIssue({
        code: "custom",
        path: ["formId"],
        message: "Selecione um formulário mapeado.",
      });
    if (value.budget.kind === "lifetime" && !value.budget.endTime)
      ctx.addIssue({
        code: "custom",
        path: ["budget", "endTime"],
        message: "Orçamento total exige término.",
      });
    if (
      value.budget.endTime &&
      Date.parse(value.budget.endTime) <= Date.parse(value.budget.startTime)
    )
      ctx.addIssue({
        code: "custom",
        path: ["budget", "endTime"],
        message: "Término deve ser posterior ao início.",
      });
  });
export type MetaAdDraftPayload = z.infer<typeof metaAdDraftPayloadSchema>;
export const metaAdDraftInputSchema = z
  .object({
    name: z.string().max(150).optional(),
    destination: z.enum(["website", "lead_form"]).optional(),
    websiteUrl: z.string().max(2000).optional(),
    formId: z
      .string()
      .regex(/^\d{1,80}$/)
      .optional(),
    pageId: z
      .string()
      .regex(/^\d{1,80}$/)
      .optional(),
    country: z.literal("BR").optional(),
    housingConfirmed: z.boolean().optional(),
    budget: z
      .object({
        kind: z.enum(["daily", "lifetime"]).optional(),
        amountMinor: z
          .string()
          .regex(/^\d{0,9}$/)
          .optional(),
        currency: z.literal("BRL").optional(),
        startTime: z.string().max(50).optional(),
        endTime: z.string().max(50).optional(),
      })
      .strict()
      .optional(),
    creative: z
      .object({
        imageHash: z.string().max(128).optional(),
        title: z.string().max(100).optional(),
        message: z.string().max(2000).optional(),
        callToAction: z.enum(["LEARN_MORE", "CONTACT_US"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type MetaAdDraftInput = z.infer<typeof metaAdDraftInputSchema>;
export type MetaAdDraftStatus =
  | "rascunho"
  | "enviando"
  | "pausado_na_meta"
  | "ativo"
  | "parcial"
  | "incerto"
  | "falhou";
export type MetaAdStep = "campaign" | "adset" | "creative" | "ad";
export const META_AD_STEPS: MetaAdStep[] = ["campaign", "adset", "creative", "ad"];
export type MetaJson = string | number | boolean | null | MetaJson[] | { [key: string]: MetaJson };
export type MetaCommandStep = {
  state: "sending" | "done" | "failed" | "uncertain";
  id?: string;
  error?: string;
  snapshot?: Record<string, MetaJson>;
};
export type MetaAdCommand = {
  id: string;
  draft_id: string;
  draft_revision: number;
  kind: "create_paused" | "set_delivery" | "change_budget";
  state: string;
  steps: Partial<Record<MetaAdStep, MetaCommandStep>>;
  payload: Record<string, MetaJson>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
export type MetaAdDraft = {
  id: string;
  connection_id: string;
  imobiliaria: "cordial" | "morar";
  account_id: string;
  page_id: string;
  revision: number;
  status: MetaAdDraftStatus;
  payload: MetaAdDraftInput;
  created_by: string;
  updated_at: string;
  created_at: string;
  commands?: MetaAdCommand[];
};

export function externalObjectName(name: string, commandId: string, step: MetaAdStep): string {
  return `${name.slice(0, 150)} [GC:${commandId}:${step}]`;
}
/** Strict fixed product combinations; SDK enum availability does not prove account access. */
export function creationStepPayload(
  step: MetaAdStep,
  draft: MetaAdDraftPayload,
  commandId: string,
  ids: Partial<Record<MetaAdStep, string>>,
): Record<string, string> {
  const name = externalObjectName(draft.name, commandId, step);
  const lead = draft.destination === "lead_form";
  if (step === "campaign")
    return {
      name,
      objective: lead ? "OUTCOME_LEADS" : "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: JSON.stringify(["HOUSING"]),
      special_ad_category_country: JSON.stringify(["BR"]),
      buying_type: "AUCTION",
      is_adset_budget_sharing_enabled: "false",
    };
  if (step === "adset") {
    if (!ids.campaign) throw new Error("Campanha ainda não confirmada.");
    return {
      name,
      campaign_id: ids.campaign,
      status: "PAUSED",
      billing_event: "IMPRESSIONS",
      optimization_goal: lead ? "LEAD_GENERATION" : "LINK_CLICKS",
      destination_type: lead ? "ON_AD" : "WEBSITE",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      [draft.budget.kind === "daily" ? "daily_budget" : "lifetime_budget"]:
        draft.budget.amountMinor,
      start_time: draft.budget.startTime,
      ...(draft.budget.endTime ? { end_time: draft.budget.endTime } : {}),
      targeting: JSON.stringify({
        geo_locations: { countries: ["BR"] },
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed"],
      }),
      ...(lead ? { promoted_object: JSON.stringify({ page_id: draft.pageId }) } : {}),
    };
  }
  if (step === "creative")
    return {
      name,
      object_story_spec: JSON.stringify({
        page_id: draft.pageId,
        link_data: {
          image_hash: draft.creative.imageHash,
          link: draft.websiteUrl,
          name: draft.creative.title,
          message: draft.creative.message,
          call_to_action: {
            type: draft.creative.callToAction,
            value: lead ? { lead_gen_form_id: draft.formId } : { link: draft.websiteUrl },
          },
        },
      }),
    };
  if (!ids.adset || !ids.creative) throw new Error("Conjunto e criativo ainda não confirmados.");
  return {
    name,
    adset_id: ids.adset,
    creative: JSON.stringify({ creative_id: ids.creative }),
    status: "PAUSED",
  };
}
export function commandMayResume(steps: MetaAdCommand["steps"]): boolean {
  return !Object.values(steps).some(
    (step) => step?.state === "sending" || step?.state === "uncertain",
  );
}
export function confirmedIds(steps: MetaAdCommand["steps"]): Partial<Record<MetaAdStep, string>> {
  return Object.fromEntries(
    Object.entries(steps)
      .filter(([, step]) => step?.state === "done" && step.id)
      .map(([key, step]) => [key, step!.id]),
  );
}
