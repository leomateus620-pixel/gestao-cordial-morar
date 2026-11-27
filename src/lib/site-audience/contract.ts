import { z } from "zod";

export const AUDIENCE_MAX_BATCH_BYTES = 8192;
export const AUDIENCE_MAX_BATCH_EVENTS = 20;

export const audiencePages = [
  "home",
  "buy",
  "rent",
  "search",
  "districts",
  "news",
  "contact",
  "advertise",
  "property",
  "favorites",
  "selection",
  "about",
  "financing",
  "correspondent",
  "privacy",
  "information",
] as const;
const audienceMenuSchema = z.enum([
  "home",
  "buy",
  "rent",
  "search",
  "districts",
  "news",
  "contact",
  "advertise",
  "favorites",
  "selection",
  "about",
  "financing",
  "correspondent",
]);
const audiencePlacementSchema = z.enum([
  "home",
  "card",
  "hero",
  "recommendations",
  "quick_view",
  "detail",
  "header",
  "footer",
  "floating",
  "contact",
]);
const page = z.enum(audiencePages);
const uuid = z.string().regex(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
const label = z
  .string()
  .max(48)
  .regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/);
const domain = z
  .string()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const attribution = z.strictObject({
  referrerDomain: domain.optional(),
  source: label.optional(),
  medium: label.optional(),
  campaign: label.optional(),
});
const base = { id: uuid, page };
const action = { ...base, placement: audiencePlacementSchema.optional() };
const propertyAction = { ...action, propertyId: uuid };
const contactAction = { ...action, propertyId: uuid.optional() };

export const audienceEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("session_start"),
    measurableActivity: z.boolean(),
    attribution: attribution.optional(),
  }),
  z.strictObject({ ...base, kind: z.literal("page_view") }),
  z.strictObject({
    ...base,
    kind: z.literal("property_view"),
    page: z.literal("property"),
    propertyId: uuid,
    navigation: z.enum(["navigation", "reload"]),
  }),
  z.strictObject({ ...action, kind: z.literal("menu_click"), menu: audienceMenuSchema }),
  z.strictObject({ ...propertyAction, kind: z.literal("property_click") }),
  z.strictObject({ ...propertyAction, kind: z.literal("quick_view") }),
  z.strictObject({ ...action, kind: z.literal("search") }),
  z.strictObject({ ...contactAction, kind: z.literal("whatsapp_click") }),
  z.strictObject({
    ...contactAction,
    kind: z.literal("form_received"),
    proof: z
      .string()
      .max(120)
      .regex(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\.[0-9]{10,13}\.[a-f0-9]{64}$/),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("active_time"),
    activeSeconds: z.int().min(1).max(15),
  }),
]);

export const audienceBatchSchema = z.strictObject({
  v: z.literal(1),
  visitorId: uuid,
  sessionId: uuid,
  events: z.array(audienceEventSchema).min(1).max(AUDIENCE_MAX_BATCH_EVENTS),
});

export const audienceConfigSchema = z.strictObject({
  enabled: z.literal(true),
  policyVersion: z.string().min(1).max(80),
  notice: z.string().trim().min(80).max(2000).optional(),
  pairs: z
    .array(z.strictObject({ source: label, medium: label }))
    .max(100)
    .optional(),
  campaigns: z.array(label).max(100).optional(),
});

export type AudienceConfig = z.infer<typeof audienceConfigSchema>;
export type AudienceBatch = z.infer<typeof audienceBatchSchema>;
export type AudienceEvent = z.infer<typeof audienceEventSchema>;
export type AudienceAttribution = z.infer<typeof attribution>;
export type AudiencePage = z.infer<typeof page>;
export type AudienceMenu = z.infer<typeof audienceMenuSchema>;
export type AudiencePlacement = z.infer<typeof audiencePlacementSchema>;
type VisitorAction = Extract<
  AudienceEvent,
  {
    kind:
      | "menu_click"
      | "property_click"
      | "quick_view"
      | "search"
      | "whatsapp_click"
      | "form_received";
  }
>;
type WithoutView<T> = T extends VisitorAction ? Omit<T, "id" | "page"> : never;
export type AudienceAction = WithoutView<VisitorAction>;
