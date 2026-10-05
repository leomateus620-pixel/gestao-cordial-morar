import { z } from "zod";

export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Informe uma data civil válida.");

const rate = z.number().finite().min(0).max(100);
export const fiscalProfileSchema = z.object({
  operation: z.enum(["administracao", "intermediacao"]),
  tomadorPapel: z.enum(["proprietario", "locatario", "outro"]),
  valorOrigem: z.enum(["comissao_mensal", "valor_revisado"]),
  elegibilidade: z.enum(["pagamento", "competencia", "revisao_manual"]),
  descricao: z.string().trim().min(10).max(800),
  regime: z.string().trim().min(3).max(120),
  localPrestacao: z.string().regex(/^\d{4,9}$/),
  layout: z.enum(["35/2021", "122/2025"]),
  regraFatoGerador: z.literal("revisao_manual"),
  retencoes: z.object({
    ir: rate,
    inss: rate,
    contribuicaoSocial: rate,
    rps: rate,
    pis: rate,
    cofins: rate,
    iss: rate,
  }),
  ibsCbs: z.boolean(),
  finNFSe: z
    .string()
    .regex(/^[0-9]$/)
    .nullable(),
  indFinal: z
    .string()
    .regex(/^[01]$/)
    .nullable(),
  tpOper: z
    .string()
    .regex(/^[1-5]$/)
    .nullable(),
  approvalReference: z.string().trim().max(1000).default("perfil padrão"),
  productionAuthorization: z.string().trim().max(1000).nullable().default(null),
  automation: z.literal("assistida"),
});
export type FiscalProfile = z.infer<typeof fiscalProfileSchema>;

export const fiscalReviewSchema = z.object({
  referenceId: z.string().uuid().optional(),
  replacesEmissionId: z.string().uuid().optional(),
  valor: z.number().finite().positive().max(999999999999.99),
  dataFatoGerador: civilDate,
  tomador: z.object({
    nome: z.string().trim().min(2).max(150),
    documento: z.string().trim().min(11).max(20),
    logradouro: z.string().trim().min(2).max(70),
    numero: z.string().trim().min(1).max(8),
    bairro: z.string().trim().min(2).max(30),
    cidadeTom: z.string().regex(/^\d{4,9}$/),
    cep: z.string().regex(/^\d{8}$/),
  }),
  motivo: z.string().trim().min(15).max(1000),
  refNfse: z
    .array(z.string().regex(/^\d{50}$/))
    .max(20)
    .optional(),
  ibsCbsImovel: z
    .object({
      inscImobFisc: z.string().max(30).optional(),
      cCIB: z
        .string()
        .regex(/^[A-Z0-9]{8}$/)
        .optional(),
      end: z
        .object({
          cep: z.string().regex(/^\d{8}$/),
          logradouro: z.string().min(2).max(70),
          numero: z.string().min(1).max(8),
          complemento: z.string().max(50).optional(),
          bairro: z.string().min(2).max(30),
        })
        .optional(),
    })
    .optional(),
});
export type FiscalReview = z.infer<typeof fiscalReviewSchema>;

export function resolveIssuer(contractBrand: string, requested?: string): "cordial" | "morar" {
  if (contractBrand === "ambas") {
    if (requested === "cordial" || requested === "morar") return requested;
    throw new Error("Defina explicitamente a empresa emissora: Cordial ou Morar.");
  }
  if (contractBrand !== "cordial" && contractBrand !== "morar")
    throw new Error("Empresa do contrato inválida. Revise o cadastro.");
  if (requested && requested !== contractBrand)
    throw new Error("A empresa emissora difere da empresa do contrato.");
  return contractBrand;
}

/** Perfil padrão de aluguel: administração, tomador = locatário, valor = comissão mensal. */
export function defaultRentalFiscalProfile(cidadeTom: string): FiscalProfile {
  return {
    operation: "administracao",
    tomadorPapel: "locatario",
    valorOrigem: "comissao_mensal",
    elegibilidade: "competencia",
    descricao: "Comissão de administração de aluguel",
    regime: "Conforme cadastro da empresa",
    localPrestacao: /^\d{4,9}$/.test(cidadeTom) ? cidadeTom : "8847",
    layout: "35/2021",
    regraFatoGerador: "revisao_manual",
    retencoes: { ir: 0, inss: 0, contribuicaoSocial: 0, rps: 0, pis: 0, cofins: 0, iss: 0 },
    ibsCbs: false,
    finNFSe: null,
    indFinal: null,
    tpOper: "1",
    approvalReference: "perfil padrão",
    productionAuthorization: null,
    automation: "assistida",
  };
}

/** Perfil efetivo: o cadastrado, ou o padrão de aluguel quando vazio. Não exige aprovação. */
export function readFiscalProfile(value: unknown, cidadeTom?: string): FiscalProfile | null {
  const result = fiscalProfileSchema.safeParse(value);
  if (result.success) return result.data;
  return cidadeTom !== undefined ? defaultRentalFiscalProfile(cidadeTom) : null;
}

/** Stable canonical JSON; no credentials or volatile send timestamps enter the fiscal identity. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
