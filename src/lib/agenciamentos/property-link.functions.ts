import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canManageAgenciamentos,
  getUserDisplayName,
  getUserRoles,
  rowToAgenciamento,
  type AgenciamentoDbRow,
} from "@/lib/agenciamentos/agenciamentos.server";
import type {
  Agenciamento,
  AgenciamentoChecklist,
  AgenciamentoFinalidade,
  AgenciamentoImobiliaria,
  AgenciamentoOrigem,
  AgenciamentoTipoImovel,
} from "@/types/agenciamento";

/** Chave idempotente da finalização do cadastro de imóvel. */
export function initialAgencyOperationKey(propertyId: string): string {
  return `property:${propertyId}:initial-agency-listing`;
}

const TIPO_MAP: Array<[RegExp, AgenciamentoTipoImovel]> = [
  [/apartamento|cobertura|kitnet|loft/i, "apartamento"],
  [/casa|sobrado|geminad/i, "casa"],
  [/terreno|lote|área$|area$/i, "terreno"],
  [/sala|comercial|loja|galp/i, "sala_comercial"],
  [/rural|sítio|sitio|chácara|chacara|fazenda/i, "area_rural"],
  [/prédio|predio|edif/i, "predio"],
];

export function mapPropertyTipo(tipo: string | null | undefined): AgenciamentoTipoImovel {
  const value = (tipo ?? "").trim();
  for (const [pattern, mapped] of TIPO_MAP) if (pattern.test(value)) return mapped;
  return "outro";
}

export function providersToImobiliaria(
  providers: readonly string[] | null | undefined,
  fallback: string | null | undefined,
): AgenciamentoImobiliaria {
  const list = new Set((providers ?? []).filter(Boolean));
  const hasCordial = list.has("cordial");
  const hasMorar = list.has("morar");
  if (hasCordial && hasMorar) return "ambas";
  if (hasCordial) return "cordial";
  if (hasMorar) return "morar";
  if (fallback === "morar") return "morar";
  if (fallback === "ambas") return "ambas";
  return "cordial";
}

export type FinalizePropertyAgencyInput = {
  propertyId: string;
  finalidade: AgenciamentoFinalidade;
  /** Destinos escolhidos no wizard; define quais itens de site são aplicáveis. */
  providers: string[];
  checklist: Partial<Omit<AgenciamentoChecklist, "validado">>;
  descricao?: string | null;
  origem?: AgenciamentoOrigem;
  dataAgenciamento?: string;
  /** Só é respeitado para admin/secretaria; corretor sempre fica com o próprio ID. */
  corretorId?: string | null;
};

type PropertyRow = {
  id: string;
  tipo: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  codigo: string | null;
  carteira: string | null;
  providers: string[] | null;
  proprietario_nome: string | null;
  proprietario_telefone: string | null;
};

export const finalizePropertyAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FinalizePropertyAgencyInput) => {
    if (!data?.propertyId) throw new Error("Imóvel não informado.");
    if (data.finalidade !== "venda" && data.finalidade !== "aluguel") {
      throw new Error("Escolha se o agenciamento é de Venda ou Aluguel.");
    }
    const descricao = (data.descricao ?? "").trim();
    if (descricao.length > 800) throw new Error("A descrição deve ter no máximo 800 caracteres.");
    return { ...data, descricao };
  })
  .handler(async ({ data, context }): Promise<Agenciamento> => {
    const roles = await getUserRoles(context.supabase, context.userId);
    const canManage = canManageAgenciamentos(roles);

    const { data: propertyRow, error: propertyError } = await context.supabase
      .from("properties")
      .select(
        "id, tipo, logradouro, numero, bairro, cidade, codigo, carteira, providers, proprietario_nome, proprietario_telefone",
      )
      .eq("id", data.propertyId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!propertyRow) throw new Error("Imóvel não encontrado ou sem permissão de acesso.");
    const property = propertyRow as unknown as PropertyRow;

    // Identidade sempre derivada do backend: o frontend não escolhe o responsável.
    const brokerId = canManage && data.corretorId ? data.corretorId : context.userId;
    const brokerName =
      brokerId === context.userId
        ? await getUserDisplayName(context.supabase, context.userId)
        : ((
            await context.supabase.from("profiles").select("nome").eq("id", brokerId).maybeSingle()
          ).data?.nome ?? "Corretor");
    const creatorName = await getUserDisplayName(context.supabase, context.userId);

    const endereco =
      [property.logradouro, property.numero].filter(Boolean).join(", ").trim() ||
      property.codigo ||
      "Imóvel sem endereço informado";

    const operationKey = initialAgencyOperationKey(property.id);
    const imobiliaria = providersToImobiliaria(
      data.providers?.length ? data.providers : property.providers,
      property.carteira,
    );

    const payload = {
      property_id: property.id,
      source: "property_registration",
      source_operation_key: operationKey,
      imobiliaria,
      finalidade: data.finalidade,
      tipo_imovel: mapPropertyTipo(property.tipo),
      endereco,
      bairro: property.bairro,
      cidade: property.cidade,
      codigo_morar: imobiliaria === "cordial" ? null : property.codigo,
      codigo_cordial: imobiliaria === "morar" ? null : property.codigo,
      descricao_imovel: data.descricao || null,
      proprietario_nome: property.proprietario_nome || "Não informado",
      proprietario_telefone: property.proprietario_telefone || "",
      proprietario_contato_preferencial: "whatsapp",
      corretor_id: brokerId,
      corretor_nome: brokerName,
      data_agenciamento: data.dataAgenciamento ?? new Date().toISOString().slice(0, 10),
      origem: data.origem ?? "prospeccao_ativa",
      status: "em_andamento",
      fotos_horizontal: Boolean(data.checklist?.fotosHorizontal),
      fotos_vertical: Boolean(data.checklist?.fotosVertical),
      fotos_realizadas: Boolean(data.checklist?.fotosHorizontal && data.checklist?.fotosVertical),
      fotos_drive: Boolean(data.checklist?.fotosDrive),
      placa_instalada: Boolean(data.checklist?.placaInstalada),
      video_realizado: Boolean(data.checklist?.videoRealizado),
      criado_por_nome: creatorName,
    };

    // Idempotência: retry ou duplo clique reaproveita o mesmo agenciamento.
    const { data: existing } = await context.supabase
      .from("agenciamentos")
      .select("id")
      .eq("source_operation_key", operationKey)
      .maybeSingle();

    if (existing?.id) {
      const { data: updated, error } = await context.supabase
        .from("agenciamentos")
        .update(payload as never)
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return rowToAgenciamento(updated as unknown as AgenciamentoDbRow);
    }

    const { data: inserted, error } = await context.supabase
      .from("agenciamentos")
      .insert({ ...payload, created_by: context.userId } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(inserted as unknown as AgenciamentoDbRow);
  });

export const getLinkedAgenciamento = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data, context }): Promise<Agenciamento | null> => {
    const { data: row, error } = await context.supabase
      .from("agenciamentos")
      .select("*")
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? rowToAgenciamento(row as unknown as AgenciamentoDbRow) : null;
  });
