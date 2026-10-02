import {
  initialAgencyOperationKey,
  mapPropertyTipo,
  providersToImobiliaria,
} from "@/lib/agenciamentos/property-link.functions";
import {
  agencyDateFromCreatedAt,
  agencyFinalidadeFromProperty,
  resolveAutoAgencyBroker,
} from "@/lib/imoveis/registration-rules";

export type AutoAgencyResult =
  | { status: "exists" | "created"; id: string }
  | { status: "skipped"; reason: string };

/**
 * Cria o agenciamento que falta para imóvel cadastrado pelo Gestão, uma única
 * vez (chave `property:<id>:initial-agency-listing`). Nunca sobrescreve um
 * agenciamento existente. Chamar só depois de autorizar quem publica.
 */
export async function ensureAutoAgency(args: {
  propertyId: string;
  publisherId: string;
  providers: string[];
}): Promise<AutoAgencyResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;

  const { data: linked } = await admin
    .from("agenciamentos")
    .select("id")
    .eq("property_id", args.propertyId)
    .limit(1)
    .maybeSingle();
  if (linked?.id) return { status: "exists", id: linked.id };

  const { data: property, error } = await admin
    .from("properties")
    .select(
      "id, source, tipo, logradouro, numero, bairro, cidade, codigo, codigo_cordial, codigo_morar, carteira, publish_targets, proprietario_nome, proprietario_telefone, corretor_id, created_by, created_at, finalidade, operacao",
    )
    .eq("id", args.propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!property) return { status: "skipped", reason: "Imóvel não encontrado." };
  if (property.source !== "gestao_cordial") return { status: "skipped", reason: "Imóvel importado." };

  const candidates = [property.created_by, args.publisherId].filter(Boolean) as string[];
  const { data: roleRows } = await admin.from("user_roles").select("user_id, role").in("user_id", candidates);
  const roles = new Map<string, string[]>();
  for (const row of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
    roles.set(row.user_id, [...(roles.get(row.user_id) ?? []), row.role]);
  }
  const brokerId = resolveAutoAgencyBroker({
    propertyCorretorId: property.corretor_id,
    createdBy: property.created_by,
    publisherId: args.publisherId,
    rolesOf: (id) => roles.get(id) ?? [],
  });
  if (!brokerId) return { status: "skipped", reason: "Imóvel sem corretor definido." };

  const names = new Map<string, string>();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nome")
    .in("id", Array.from(new Set([brokerId, args.publisherId])));
  for (const p of (profiles ?? []) as Array<{ id: string; nome: string | null }>) {
    if (p.nome?.trim()) names.set(p.id, p.nome.trim());
  }

  const endereco =
    [property.logradouro, property.numero].filter(Boolean).join(", ").trim() ||
    property.codigo ||
    "Imóvel sem endereço informado";

  const payload = {
    property_id: property.id,
    source: "property_publication_auto",
    source_operation_key: initialAgencyOperationKey(property.id),
    imobiliaria: providersToImobiliaria(
      args.providers.length ? args.providers : property.publish_targets,
      property.carteira,
    ),
    finalidade: agencyFinalidadeFromProperty(property.finalidade, property.operacao),
    tipo_imovel: mapPropertyTipo(property.tipo),
    endereco,
    bairro: property.bairro,
    cidade: property.cidade,
    codigo_morar: property.codigo_morar?.trim() || null,
    codigo_cordial: property.codigo_cordial?.trim() || null,
    proprietario_nome: property.proprietario_nome || "Não informado",
    proprietario_telefone: property.proprietario_telefone || "",
    proprietario_contato_preferencial: "whatsapp",
    corretor_id: brokerId,
    corretor_nome: names.get(brokerId) ?? "Corretor",
    data_agenciamento: agencyDateFromCreatedAt(property.created_at),
    origem: "prospeccao_ativa",
    status: "em_andamento",
    created_by: args.publisherId,
    criado_por_nome: names.get(args.publisherId) ?? "Sistema",
  };

  const { data: inserted, error: insertError } = await admin
    .from("agenciamentos")
    .insert(payload)
    .select("id")
    .single();
  if (insertError) {
    if (/duplicate key|unique/i.test(insertError.message)) {
      const { data: raced } = await admin
        .from("agenciamentos")
        .select("id")
        .eq("source_operation_key", payload.source_operation_key)
        .maybeSingle();
      if (raced?.id) return { status: "exists", id: raced.id };
    }
    throw new Error(insertError.message);
  }
  return { status: "created", id: inserted.id };
}
