import { z } from "zod";
import { mediaSchema } from "../cordial-site/contract";

export const brandSchema = z.enum(["cordial", "morar"]);
export type BotBrand = z.infer<typeof brandSchema>;
const text = z.string().trim().min(1).max(100);
export const countSchema = z
  .object({ op: z.enum(["eq", "gte", "gt", "lte", "lt"]), value: z.number().int().min(0).max(100) })
  .strict();
export const boundSchema = z
  .object({ value: z.number().finite().min(0).max(1e12), inclusive: z.boolean() })
  .strict();
export const rangeSchema = z
  .object({ min: boundSchema.nullable(), max: boundSchema.nullable() })
  .strict()
  .refine(
    (v) =>
      !v.min ||
      !v.max ||
      v.min.value < v.max.value ||
      (v.min.value === v.max.value && v.min.inclusive && v.max.inclusive),
    "Faixa inválida",
  );
export const featureNames = ["piscina", "churrasqueira", "sala", "cozinha"] as const;
export const featureSchema = z
  .object({
    name: z.enum(featureNames),
    scope: z.enum(["private", "condominium"]),
    state: z.enum(["present", "absent"]),
    required: z.boolean(),
  })
  .strict();
export const filtersSchema = z
  .object({
    operation: z.enum(["venda", "aluguel"]).nullable(),
    type: text.nullable(),
    city: text.nullable(),
    district: text.nullable(),
    reference: text.nullable(),
    budget: rangeSchema.nullable(),
    bedrooms: countSchema.nullable(),
    bathrooms: countSchema.nullable(),
    suites: countSchema.nullable(),
    parking: countSchema.nullable(),
    area: z
      .object({ kind: z.enum(["util", "total", "construida", "terreno"]), range: rangeSchema })
      .strict()
      .nullable(),
    furnished: z.boolean().nullable(),
    financing: z.boolean().nullable(),
    exchange: z.boolean().nullable(),
    stage: text.nullable(),
    features: z.array(featureSchema).max(8),
  })
  .strict();
export type SearchFilters = z.infer<typeof filtersSchema>;
export const filterPatchSchema = filtersSchema.partial().strict();
export type FilterPatch = z.infer<typeof filterPatchSchema>;
export const emptyFilters = (): SearchFilters => ({
  operation: null,
  type: null,
  city: null,
  district: null,
  reference: null,
  budget: null,
  bedrooms: null,
  bathrooms: null,
  suites: null,
  parking: null,
  area: null,
  furnished: null,
  financing: null,
  exchange: null,
  stage: null,
  features: [],
});
export const draftSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    filters: filtersSchema,
    countsAnswered: z.boolean(),
    budgetAnswered: z.boolean(),
  })
  .strict();
export type SearchDraft = z.infer<typeof draftSchema>;
export const newDraft = (): SearchDraft => ({
  revision: 0,
  filters: emptyFilters(),
  countsAnswered: false,
  budgetAnswered: false,
});
export const actionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text"),
      text: z.string().trim().min(1).max(1800),
      replyTo: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("filters"),
      patch: filterPatchSchema,
      countsAnswered: z.boolean().optional(),
      budgetAnswered: z.boolean().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("search") }).strict(),
  z.object({ kind: z.literal("reset") }).strict(),
  z
    .object({
      kind: z.literal("property_question"),
      publicId: z.string().uuid(),
      turnId: z.string().uuid(),
      feature: z.enum(featureNames),
      scope: z.enum(["private", "condominium"]),
    })
    .strict(),
]);
export type BotAction = z.infer<typeof actionSchema>;
export const chatInputSchema = z
  .object({
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    action: actionSchema,
  })
  .strict();
export type ChatInput = z.infer<typeof chatInputSchema>;
export const botSessionInputSchema = z.object({ openingId: z.string().uuid().optional() }).strict();
export const botPanelOpenEventSchema = z
  .object({ kind: z.literal("panel_open"), eventId: z.string().uuid() })
  .strict();
export const botOperationalEventSchema = z
  .object({
    kind: z.literal("contact_click"),
    eventId: z.string().uuid(),
    source: z.enum(["header", "card", "quota", "unavailable"]),
    publicId: z.string().uuid().nullable(),
  })
  .strict()
  .refine((event) => (event.source === "card" ? event.publicId !== null : event.publicId === null));
const nullableNumber = z.number().finite().nonnegative().nullable();
export const modelPropertySchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string().max(80),
    operation: z.enum(["venda", "aluguel"]),
    type: text.nullable(),
    city: text.nullable(),
    district: text.nullable(),
    price: nullableNumber,
    priceMode: z.enum(["fixo", "consulte"]),
    bedrooms: nullableNumber,
    bathrooms: nullableNumber,
    suites: nullableNumber,
    parking: nullableNumber,
    areas: z
      .object({
        util: nullableNumber,
        total: nullableNumber,
        construida: nullableNumber,
        terreno: nullableNumber,
      })
      .strict(),
    furnished: z.boolean().nullable(),
    financing: z.boolean().nullable(),
    exchange: z.boolean().nullable(),
    stage: text.nullable(),
    description: z.string().max(12000),
    features: z.array(z.string().max(200)).max(100),
  })
  .strict();
export type ModelProperty = z.infer<typeof modelPropertySchema>;
export const documentSchema = z
  .object({
    brand: brandSchema,
    version: z.string().regex(/^[a-f0-9]{32}$/),
    property: modelPropertySchema,
    cover: mediaSchema.nullable(),
  })
  .strict();
export type SearchDocument = z.infer<typeof documentSchema>;
export const cardSchema = z
  .object({
    id: z.string().uuid(),
    version: z.string().regex(/^[a-f0-9]{32}$/),
    reference: z.string().max(80),
    title: z.string().max(180),
    location: z.string().max(210),
    price: z.string().max(80),
    bedrooms: nullableNumber,
    bathrooms: nullableNumber,
    features: z.array(z.string().max(100)).max(2),
    detailPath: z.string().max(500),
    imagePath: z.string().max(500).nullable(),
    whatsappUrl: z.string().max(2000),
    alternative: z.array(z.string().max(150)).max(8),
  })
  .strict();
export type BotCard = z.infer<typeof cardSchema>;
export const questionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("operation") }).strict(),
  z.object({ kind: z.literal("counts") }).strict(),
  z.object({ kind: z.literal("budget"), operation: z.enum(["venda", "aluguel"]) }).strict(),
  z.object({ kind: z.literal("location"), cities: z.array(text).max(30), district: text }).strict(),
  z.object({ kind: z.literal("clarify"), message: z.string().max(200) }).strict(),
]);
export type BotQuestion = z.infer<typeof questionSchema>;
export const turnResultSchema = z
  .object({
    requestId: z.string().uuid(),
    draft: draftSchema,
    answer: z.string().max(800),
    cards: z.array(cardSchema).max(5),
    question: questionSchema.nullable(),
    exhausted: z.boolean(),
    unavailable: z.boolean(),
  })
  .strict();
export type TurnResult = z.infer<typeof turnResultSchema>;
export const eventSchema = z
  .object({
    requestId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    type: z.enum([
      "accepted",
      "status",
      "filters_updated",
      "question",
      "results",
      "answer",
      "quota_exhausted",
      "error",
      "done",
    ]),
    result: turnResultSchema.optional(),
    message: z.string().max(800).optional(),
    code: z.string().max(50).optional(),
  })
  .strict();
export type BotEvent = z.infer<typeof eventSchema>;
export const interpretationSchema = z
  .object({
    intent: z.enum(["search", "greeting", "out_of_scope", "clarify", "detail"]),
    patch: filterPatchSchema,
    countsAnswered: z.boolean(),
    budgetAnswered: z.boolean(),
    ambiguity: z.enum(["none", "churrascaria", "location", "other"]),
    ordinal: z.number().int().min(1).max(5).nullable(),
    feature: z.enum(featureNames).nullable(),
    scope: z.enum(["private", "condominium"]),
  })
  .strict();
export type Interpretation = z.infer<typeof interpretationSchema>;
export const suggestionSchema = z
  .object({ id: z.string().max(100), label: z.string().max(120), patch: filterPatchSchema })
  .strict();
export type Suggestion = z.infer<typeof suggestionSchema>;
export const normalizedEventSchema = z
  .object({
    eventId: z.string().uuid(),
    kind: z.enum(["impression", "search", "open", "whatsapp"]),
    category: z.enum(["type", "district", "budget", "feature"]),
    suggestionId: z.string().max(100),
    consent: z.literal(true),
  })
  .strict();
