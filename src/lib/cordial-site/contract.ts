import { z } from "zod";

const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().finite().min(0).max(1e12).optional(),
);
const optionalText = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().max(100).optional(),
);
const emptyToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);
const choice = z.preprocess(emptyToUndefined, z.enum(["sim", "nao"]).optional());
export const searchSchema = z
  .object({
    finalidade: z.preprocess(emptyToUndefined, z.enum(["venda", "aluguel"]).optional()),
    tipo: optionalText,
    cidade: optionalText,
    bairro: optionalText,
    referencia: optionalText,
    exata: z.preprocess(emptyToUndefined, z.enum(["sim", "nao"]).default("sim")),
    q: optionalText,
    dormitorios: optionalNumber,
    contagem: z.preprocess(emptyToUndefined, z.enum(["minima", "exata"]).default("minima")),
    banheiros: optionalNumber,
    suites: optionalNumber,
    vagas: optionalNumber,
    precoMin: optionalNumber,
    precoMax: optionalNumber,
    areaMin: optionalNumber,
    areaMax: optionalNumber,
    areaTipo: z.preprocess(
      emptyToUndefined,
      z.enum(["util", "total", "construida", "terreno"]).default("construida"),
    ),
    mobiliado: choice,
    permuta: choice,
    financiamento: choice,
    fotos: choice,
    estagio: optionalText,
    valorModo: z.preprocess(emptyToUndefined, z.enum(["fixo", "consulte"]).optional()),
    destaque: choice,
    ordem: z.enum(["recentes", "preco_asc", "preco_desc", "area_desc"]).default("recentes"),
    pagina: z.coerce.number().int().min(1).max(10000).default(1),
    visualizacao: z.enum(["grade", "lista"]).default("grade"),
  })
  .superRefine((v, ctx) => {
    for (const [min, max] of [
      ["precoMin", "precoMax"],
      ["areaMin", "areaMax"],
    ] as const) {
      if (v[min] != null && v[max] != null && v[min]! > v[max]!)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [max],
          message: "O máximo deve ser maior ou igual ao mínimo.",
        });
    }
    for (const k of ["dormitorios", "banheiros", "suites", "vagas"] as const)
      if (v[k] != null && (!Number.isInteger(v[k]) || v[k]! > 100))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [k],
          message: "Informe um inteiro entre 0 e 100.",
        });
  });
export type SiteSearch = z.infer<typeof searchSchema>;
export const defaultSearch = searchSchema.parse({});
export function searchParams(value: Partial<SiteSearch>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(value))
    if (v !== undefined && v !== "" && v !== defaultSearch[k as keyof SiteSearch])
      params.set(k, String(v));
  return params.toString();
}
export const mediaSchema = z.object({
  id: z.string().uuid(),
  version: z.string().regex(/^[a-f0-9]{32}$/),
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  position: z.number().int().min(0),
});
const nullableNumber = z.number().finite().nonnegative().nullable();
// This allowlist is also parsed on the server. Internal data cannot survive serialization.
export const publicPropertySchema = z.object({
  id: z.string().uuid(),
  reference: z.string().max(80),
  operation: z.enum(["venda", "aluguel"]),
  type: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
  address: z.string().nullable(),
  price: nullableNumber,
  priceMode: z.enum(["fixo", "consulte"]),
  bedrooms: nullableNumber,
  bathrooms: nullableNumber,
  suites: nullableNumber,
  parking: nullableNumber,
  areas: z.object({
    util: nullableNumber,
    total: nullableNumber,
    construida: nullableNumber,
    terreno: nullableNumber,
  }),
  furnished: z.boolean().nullable(),
  exchange: z.boolean().nullable(),
  financing: z.boolean().nullable(),
  stage: z.string().nullable(),
  featured: z.boolean(),
  publishedAt: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  cover: mediaSchema.nullable(),
  photoCount: z.number().int().nonnegative(),
});
export type PublicProperty = z.infer<typeof publicPropertySchema>;
export type PublicMedia = z.infer<typeof mediaSchema>;
export type PublicDetail = PublicProperty & { images: PublicMedia[] };
export type SiteFacets = {
  types: Array<{ value: string; count: number }>;
  cities: Array<{ value: string; count: number }>;
  districts: Array<{ value: string; city: string; count: number }>;
  stages: string[];
  total: number;
};
export type SiteCatalog = {
  items: PublicProperty[];
  total: number;
  page: number;
  pageSize: number;
};
export const settingsSchema = z.object({
  brand: z.string().max(80).default("Cordial Imóveis"),
  tagline: z.string().max(140).default("Sentir-se em casa!"),
  phone: z.string().max(30).default(""),
  whatsapp: z
    .string()
    .regex(/^\d{10,15}$|^$/)
    .default(""),
  email: z.union([z.string().email(), z.literal("")]).default(""),
  address: z.string().max(250).default(""),
  hours: z.string().max(160).default(""),
  creci: z.string().max(60).default(""),
  about: z.string().max(6000).default(""),
  privacy: z.string().max(20000).default(""),
  instagram: z.union([z.string().url().startsWith("https://"), z.literal("")]).default(""),
  links: z
    .array(z.object({ label: z.string().max(100), url: z.string().url().startsWith("https://") }))
    .max(12)
    .default([]),
});
export type SiteSettings = z.infer<typeof settingsSchema>;
export type SitePage = {
  slug: string;
  kind: "page" | "news" | "district";
  title: string;
  summary: string;
  body: string;
  publishedAt: string | null;
};
export type SiteBootstrap = {
  settings: SiteSettings;
  facets: SiteFacets;
  available: boolean;
  canonicalOrigin: string | null;
  indexable: boolean;
};
export const leadSchema = z
  .object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .max(25)
      .refine((v) => /^\+?[\d\s()-]{10,25}$/.test(v) && v.replace(/\D/g, "").length >= 10),
    email: z.union([z.string().email().max(200), z.literal("")]).default(""),
    message: z.string().trim().min(10).max(3000),
    kind: z.enum(["contato", "interesse", "captacao"]),
    propertyId: z.string().uuid().optional(),
    operation: z.enum(["venda", "aluguel"]).optional(),
    propertyType: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    consent: z.literal(true),
    website: z.string().max(0).default(""),
    entryPath: z
      .string()
      .max(500)
      .regex(/^\/(?!\/)[^\r\n]*$/),
    campaign: z
      .object({
        utm_source: z.string().max(100).optional(),
        utm_medium: z.string().max(100).optional(),
        utm_campaign: z.string().max(100).optional(),
      })
      .default({}),
  })
  .superRefine((v, c) => {
    if (v.kind === "interesse" && !v.propertyId)
      c.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["propertyId"],
        message: "Selecione o imóvel.",
      });
  });
export type SiteLead = z.infer<typeof leadSchema>;
