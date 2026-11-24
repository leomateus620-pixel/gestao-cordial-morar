import { z } from "zod";
import type { RentalContractFull, RentalContractInput } from "@/types/rental";
import {
  fillContract,
  insurersForBrand,
  missingFields,
  qualify,
  qualifySpouse,
  type ContractBrand,
  type ContractGuarantee,
  type ContractInsurer,
} from "./contract-generator";
import { spousePending } from "./guarantor-spouse";

const short = z.string().max(240);
const optionalText = short.nullish();
const optionalNumber = z.number().finite().nullish();
const existingId = z.uuid().nullish();
const brandSchema = z.enum(["cordial", "morar", "ambas"]);
const person = z.object({
  nome: short,
  cpfCnpj: optionalText,
  telefone: optionalText,
  email: optionalText,
  endereco: optionalText,
  profissao: optionalText,
  observacoes: z.string().max(5000).nullish(),
});
const partyDetails = z.object({
  nationality: short.optional(),
  maritalStatus: short.optional(),
  rg: short.optional(),
  profession: short.optional(),
  address: short.optional(),
});
export const templateOptionsSchema = z.object({
  modelBrand: z.enum(["cordial", "morar"]).optional(),
  registration: short.optional(),
  guarantorAssets: z.string().max(5000).optional(),
  signedOn: z.string().max(10).optional(),
  insuranceInstallments: z.number().int().min(1).max(120).optional(),
  owner: partyDetails.optional(),
  tenants: z.array(partyDetails).max(30).optional(),
  guarantors: z.array(partyDetails).max(30).optional(),
});
export type RentalTemplateOptions = z.infer<typeof templateOptionsSchema>;

export const rentalWorkspaceSchema = z.object({
  brand: brandSchema,
  property: z.object({
    existingId,
    data: z.object({
      apelido: short,
      tipo: z.enum(["apartamento", "casa", "sala_comercial", "terreno", "kitnet", "outro"]),
      logradouro: short,
      numero: optionalText,
      complemento: optionalText,
      bairro: optionalText,
      cidade: optionalText,
      uf: optionalText,
      cep: optionalText,
      quartos: optionalNumber,
      banheiros: optionalNumber,
      vagas: optionalNumber,
      areaM2: optionalNumber,
      valorSugerido: optionalNumber,
      status: z.enum(["disponivel", "alugado", "manutencao", "reservado", "inativo"]),
      observacoes: z.string().max(5000).nullish(),
      brand: brandSchema,
      proprietarioNome: optionalText,
      proprietarioCpf: optionalText,
      proprietarioEmail: optionalText,
      proprietarioTelefone: optionalText,
    }),
  }),
  tenants: z
    .array(
      z.object({
        existingId,
        data: person.extend({
          telefone: short,
          rendaAproximada: optionalNumber,
          dataNascimento: optionalText,
        }),
      }),
    )
    .min(1)
    .max(30),
  guarantees: z
    .array(
      z.object({
        tipo: z.enum(["fiador", "caucao", "seguro_fianca"]),
        guarantor: z
          .object({ existingId, data: person.extend({ vinculo: optionalText }) })
          .nullish(),
        conjuge: z
          .object({
            enabled: z.boolean(),
            papel: z.enum(["esposa", "conjuge"]),
            nome: short,
            cpf: short,
            rg: short,
            profissao: short,
            telefone: short,
          })
          .nullish(),
        valorCaucao: optionalNumber,
        seguroSeguradora: optionalText,
        seguroApolice: optionalText,
        seguroValorMensal: optionalNumber,
      }),
    )
    .max(30),
  valorMensal: z.number().finite(),
  comissaoMensal: optionalNumber,
  dataInicio: z.string().max(10),
  dataFim: z.string().max(10),
  diaVencimento: z.number().int(),
  status: z.enum(["ativo", "pendente_assinatura", "vencido", "encerrado", "cancelado"]),
  observacoes: z.string().max(5000).nullish(),
  template: templateOptionsSchema,
  // Keep the input text for decimal fields on an incomplete draft.
  money: z.record(z.string().max(32), z.string().max(40)).optional(),
});
export type RentalWorkspaceInput = z.infer<typeof rentalWorkspaceSchema>;
export type RentalWorkspaceDraft = {
  id: string;
  revision: number;
  input: RentalWorkspaceInput;
  updatedAt: string;
};

export const CONTRACT_GROUPS = ["Imóvel", "Partes", "Condições", "Garantias"] as const;
type Group = (typeof CONTRACT_GROUPS)[number];
export type ContractIssue = { group: Group; field: string; label: string };
export const GUARANTEE_LABEL: Record<ContractGuarantee, string> = {
  fiador: "Fiador",
  caucao: "Caução",
  seguro_fianca: "Seguro-fiança",
};

type Templates = Record<`${ContractBrand}-${ContractGuarantee}`, string>;

function validDate(value: string) {
  const timestamp = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function addYear(date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() + 1);
  return start.toISOString().slice(0, 10);
}

export function workspaceBaseIssues(input: RentalWorkspaceInput): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const add = (group: Group, field: string, label: string) => issues.push({ group, field, label });
  if (!input.property.data.apelido.trim())
    add("Imóvel", "property-reference", "Referência do imóvel");
  if (!input.property.data.logradouro.trim())
    add("Imóvel", "property-street", "Logradouro do imóvel");
  const seenTenants = new Set<string>();
  input.tenants.forEach(({ data, existingId }, index) => {
    if (existingId && seenTenants.has(existingId))
      add("Partes", `tenant-${index}-select`, `Locatário ${index + 1} já incluído`);
    if (existingId) seenTenants.add(existingId);
    if (!data.nome.trim()) add("Partes", `tenant-${index}-name`, `Nome do locatário ${index + 1}`);
    if (data.telefone.replace(/\D/g, "").length < 10)
      add("Partes", `tenant-${index}-phone`, `Telefone do locatário ${index + 1}`);
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      add("Partes", `tenant-${index}-email`, `E-mail do locatário ${index + 1}`);
  });
  if (input.valorMensal <= 0) add("Condições", "rent", "Valor mensal do aluguel");
  if ((input.comissaoMensal ?? 0) < 0) add("Condições", "commission", "Comissão mensal válida");
  if (!validDate(input.dataInicio)) add("Condições", "starts", "Data de início");
  if (!validDate(input.dataFim) || input.dataFim <= input.dataInicio)
    add("Condições", "ends", "Data de fim posterior ao início");
  if (input.diaVencimento < 1 || input.diaVencimento > 31)
    add("Condições", "due", "Dia de vencimento entre 1 e 31");
  input.guarantees.forEach((g, index) => {
    if (g.tipo === "fiador" && !g.guarantor?.data.nome.trim())
      add("Garantias", `guarantor-${index}-name`, `Nome do fiador ${index + 1}`);
    if (g.tipo === "caucao" && !(Number(g.valorCaucao) > 0))
      add("Garantias", `guarantee-${index}-deposit`, "Valor da caução");
    if (g.tipo === "seguro_fianca" && !g.seguroSeguradora?.trim())
      add("Garantias", `guarantee-${index}-insurer`, "Seguradora contratada");
  });
  return issues;
}

function propertyPurpose(type: RentalWorkspaceInput["property"]["data"]["tipo"]) {
  if (type === "sala_comercial") return "comercial";
  if (type === "apartamento" || type === "casa" || type === "kitnet") return "residencial";
  return "geral";
}

const TEMPLATE_PURPOSE: Record<keyof Templates, ReturnType<typeof propertyPurpose>> = {
  "cordial-fiador": "comercial",
  "cordial-caucao": "residencial",
  "cordial-seguro_fianca": "residencial",
  "morar-fiador": "geral",
  "morar-caucao": "geral",
  "morar-seguro_fianca": "residencial",
};

export function contractWorkflowReview(
  input: RentalWorkspaceInput,
  templates: Templates,
  insurers: readonly ContractInsurer[],
) {
  const {
    template: extra,
    property: { data: p },
    tenants,
    guarantees,
  } = input;
  const brand = input.brand === "ambas" ? extra.modelBrand : input.brand;
  const guarantee = guarantees[0]?.tipo;
  const key = brand && guarantee ? (`${brand}-${guarantee}` as const) : null;
  const approvedPurpose = key ? TEMPLATE_PURPOSE[key] : null;
  const purpose = propertyPurpose(p.tipo);
  const approved =
    key && (approvedPurpose === "geral" || approvedPurpose === purpose) ? templates[key] : null;

  const issues = workspaceBaseIssues(input);
  const add = (group: Group, field: string, label: string) => {
    if (!issues.some((issue) => issue.field === field)) issues.push({ group, field, label });
  };
  if (!brand) add("Condições", "template-brand", "Imobiliária do contrato");
  if (!guarantee) add("Garantias", "guarantees", "Garantia com modelo aprovado");
  if (key && !approved)
    add("Imóvel", "property-type", "Modelo aprovado para o tipo e garantia selecionados");
  if (
    guarantees.some((g) => g.tipo !== guarantee) ||
    (guarantees.length > 1 && guarantee !== "fiador")
  ) {
    add("Garantias", "guarantees", "Modelo aprovado para a combinação de garantias");
  }

  // The approved templates use a one-year term. Other terms use an external contract.
  if (validDate(input.dataInicio) && validDate(input.dataFim)) {
    const anniversary = addYear(input.dataInicio);
    const inclusiveEnd = new Date(Date.parse(anniversary) - 86_400_000).toISOString().slice(0, 10);
    if (input.dataFim !== anniversary && input.dataFim !== inclusiveEnd)
      add("Condições", "ends", "Prazo de 12 meses do modelo aprovado");
  }
  if (approved?.includes("até o dia 10 de cada mês") && input.diaVencimento !== 10)
    add("Condições", "due", "Vencimento no dia 10 do modelo aprovado");

  function party(
    data: {
      nome?: string | null;
      cpfCnpj?: string | null;
      profissao?: string | null;
      endereco?: string | null;
    },
    details: RentalTemplateOptions["owner"] | undefined,
    prefix: string,
    title: string,
    group: Group,
    inBaseForm = false,
  ) {
    const info = {
      ...data,
      ...details,
      profissao: details?.profession || data.profissao,
      endereco: details?.address || data.endereco,
    };
    const required = [
      ["name", info.nome, "Nome"],
      ["cpf", info.cpfCnpj, "CPF/CNPJ"],
      ["profession", info.profissao, "Profissão"],
      ["address", info.endereco, "Endereço"],
      ["nationality", info.nationality, "Nacionalidade"],
      ["maritalStatus", info.maritalStatus, "Estado civil"],
      ["rg", info.rg, "RG"],
    ] as const;
    for (const [field, value, label] of required) {
      const baseField =
        field === "name" ||
        field === "cpf" ||
        (inBaseForm && (field === "profession" || field === "address"));
      if (!value?.trim())
        add(group, `${baseField ? prefix : `extra-${prefix}`}-${field}`, `${label} · ${title}`);
    }
    return { label: title, qualificacao: qualify(info) };
  }

  const owner = party(
    { nome: p.proprietarioNome, cpfCnpj: p.proprietarioCpf },
    extra.owner,
    "owner",
    "Locador",
    "Partes",
  );
  const parties = tenants.map(({ data }, i) =>
    party(data, extra.tenants?.[i], `tenant-${i}`, `Locatário ${i + 1}`, "Partes", true),
  );
  const guarantors = guarantees.flatMap((g, i) => {
    if (g.tipo !== "fiador") return [];
    if (g.conjuge?.enabled) {
      for (const label of spousePending(g.conjuge)) {
        const field = label.startsWith("CPF")
          ? "cpf"
          : label.startsWith("RG")
            ? "rg"
            : label.startsWith("profissão")
              ? "profession"
              : label.startsWith("telefone")
                ? "phone"
                : "name";
        add("Garantias", `guarantor-${i}-spouse-${field}`, `${label} · Fiador ${i + 1}`);
      }
    }
    return [
      {
        ...party(
          g.guarantor?.data ?? {},
          extra.guarantors?.[i],
          `guarantor-${i}`,
          `Fiador ${i + 1}`,
          "Garantias",
        ),
        conjuge: g.conjuge?.enabled ? qualifySpouse(g.conjuge) : null,
      },
    ];
  });
  if (!p.cidade?.trim()) add("Imóvel", "property-city", "Cidade do imóvel");
  if (!p.uf?.trim()) add("Imóvel", "property-state", "UF do imóvel");
  if (!validDate(extra.signedOn ?? ""))
    add("Condições", "template-date", "Data prevista para assinatura");
  if (approved?.includes("{{matricula}}") && !extra.registration?.trim())
    add("Imóvel", "template-registration", "Matrícula do imóvel");
  if (approved?.includes("{{bens_fiadores}}") && !extra.guarantorAssets?.trim())
    add("Garantias", "template-assets", "Bens oferecidos pelos fiadores");
  const primary = guarantees[0];
  const insurerOptions = brand ? insurersForBrand([...insurers], brand) : [];
  const insurer =
    insurerOptions.find(
      (i) => i.nome.toLowerCase() === primary?.seguroSeguradora?.trim().toLowerCase(),
    ) ?? null;
  if (guarantee === "seguro_fianca") {
    if (!insurer)
      add("Garantias", "guarantee-0-insurer", "Seguradora ativa com cláusula para a imobiliária");
    if (!(Number(primary.seguroValorMensal) > 0))
      add("Garantias", "guarantee-0-premium", "Valor mensal do seguro");
  }
  const text =
    approved && brand && guarantee
      ? fillContract(approved, {
          brand,
          guarantee,
          locador: owner,
          locatarios: parties,
          fiadores: guarantors,
          imovelEndereco: [
            [
              p.logradouro.trim(),
              p.numero?.trim() ? `nº ${p.numero.trim()}` : "",
              p.complemento?.trim(),
            ]
              .filter(Boolean)
              .join(", "),
            p.bairro?.trim() ? `bairro ${p.bairro.trim()}` : "",
            p.cidade?.trim()
              ? `na cidade de ${p.cidade.trim()}${p.uf ? `, ${p.uf.trim().toUpperCase()}` : ""}`
              : "",
          ]
            .filter(Boolean)
            .join(", "),
          matricula: extra.registration ?? "",
          bensFiadores: extra.guarantorAssets ?? "",
          dataInicio: input.dataInicio,
          dataAssinatura: extra.signedOn ?? "",
          valorAluguel: input.valorMensal,
          valorCaucao: primary?.valorCaucao ?? null,
          insurer,
          seguroValorMensal: primary?.seguroValorMensal ?? null,
          seguroParcelas: extra.insuranceInstallments ?? 12,
        })
      : null;
  if (text && !issues.length && missingFields(text).length)
    add("Condições", "template-fields", `Campos do modelo: ${missingFields(text).join(", ")}`);
  const versionContext = JSON.stringify([
    brand,
    key,
    p.tipo,
    p.cep?.trim() || null,
    input.dataInicio,
    input.dataFim,
    input.diaVencimento,
    guarantees.map((g) => [g.tipo, g.seguroApolice?.trim() || null]),
  ]);
  return { brand, guarantee, purpose: approvedPurpose, key, text, issues, versionContext };
}

export function workspaceInputFromContract(contract: RentalContractFull): RentalWorkspaceInput {
  const {
    property: { id, createdAt, updatedAt, ...property },
    tenant,
    tenants,
    guarantees,
  } = contract;
  return {
    brand: contract.brand,
    property: { existingId: id, data: property },
    tenants: (tenants.length ? tenants : [tenant]).map(({ id, telefone, ...data }) => ({
      existingId: id,
      data: { ...data, telefone },
    })),
    guarantees: guarantees.map(
      ({
        tipo,
        guarantor,
        conjuge,
        valorCaucao,
        seguroSeguradora,
        seguroApolice,
        seguroValorMensal,
      }) => ({
        tipo,
        guarantor: guarantor ? { existingId: guarantor.id, data: guarantor } : null,
        conjuge,
        valorCaucao,
        seguroSeguradora,
        seguroApolice,
        seguroValorMensal,
      }),
    ),
    valorMensal: contract.valorMensal,
    comissaoMensal: contract.comissaoMensal,
    dataInicio: contract.dataInicio,
    dataFim: contract.dataFim,
    diaVencimento: contract.diaVencimento,
    status: contract.status,
    observacoes: contract.observacoes,
    template: contract.templateOptions ?? {},
  };
}

export function rentalInputFromWorkspace(
  input: RentalWorkspaceInput,
  contractId?: string,
): RentalContractInput {
  return { ...input, contractId, templateOptions: input.template };
}
