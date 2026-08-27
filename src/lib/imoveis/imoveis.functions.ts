import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Property,
  PropertyDetail,
  PropertyImage,
  PropertyPublicationBadge,
  PropertyWriteInput,
} from "@/types/property";

const WRITE_COLUMNS: Record<keyof PropertyWriteInput, string> = {
  carteira: "carteira",
  operacao: "operacao",
  finalidade: "finalidade",
  tipo: "tipo",
  codigo: "codigo",
  referencia: "referencia",
  localizacaoExibida: "localizacao_exibida",
  cep: "cep",
  logradouro: "logradouro",
  numero: "numero",
  bairro: "bairro",
  cidade: "cidade",
  uf: "uf",
  zona: "zona",
  regiao: "regiao",
  dormitorios: "dormitorios",
  suites: "suites",
  banheiros: "banheiros",
  vagas: "vagas",
  salas: "salas",
  areaPrincipal: "area_principal",
  areaTipo: "area_tipo",
  areaTotal: "area_total",
  areaUtil: "area_util",
  areaConstruida: "area_construida",
  areaTerreno: "area_terreno",
  mobiliado: "mobiliado",
  valor: "valor",
  valorModo: "valor_modo",
  valorIptu: "valor_iptu",
  valorCondominio: "valor_condominio",
  aceitaFinanciamento: "aceita_financiamento",
  permuta: "permuta",
  descricaoImovel: "descricao_imovel",
  pontosFortes: "pontos_fortes",
  exclusividade: "exclusividade",
  autorizacao: "autorizacao",
  escriturada: "escriturada",
  averbada: "averbada",
  comPlaca: "com_placa",
  disponibilidade: "disponibilidade",
  exibirImovel: "exibir_imovel",
  destaqueInicial: "destaque_inicial",
  proprietarioNome: "proprietario_nome",
  origemCaptacao: "origem_captacao",
  nomeEmpreendimento: "nome_empreendimento",
  unidade: "unidade",
};

function toDbPayload(input: Partial<PropertyWriteInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(WRITE_COLUMNS)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) payload[column] = value === "" ? null : value;
  }
  return payload;
}


type Row = Record<string, unknown>;

function mapRow(
  row: Row,
  extras: { coverUrl?: string | null; publications?: PropertyPublicationBadge[] } = {},
): Property {
  const r = row as Record<string, any>;
  return {
    id: r.id,
    carteira: r.carteira,
    operacao: r.operacao,
    tipo: r.tipo ?? null,
    localizacaoExibida: r.localizacao_exibida ?? null,
    bairro: r.bairro ?? null,
    cidade: r.cidade ?? null,
    uf: r.uf ?? null,
    valor: r.valor === null || r.valor === undefined ? null : Number(r.valor),
    valorModo: r.valor_modo,
    valorExibido: r.valor_exibido ?? null,
    dormitorios: r.dormitorios ?? null,
    suites: r.suites ?? null,
    banheiros: r.banheiros ?? null,
    vagas: r.vagas ?? null,
    areaPrincipal: r.area_principal === null || r.area_principal === undefined ? null : Number(r.area_principal),
    areaTipo: r.area_tipo ?? null,
    areaTotal: r.area_total === null || r.area_total === undefined ? null : Number(r.area_total),
    areaUtil: r.area_util === null || r.area_util === undefined ? null : Number(r.area_util),
    areaConstruida:
      r.area_construida === null || r.area_construida === undefined ? null : Number(r.area_construida),
    areaTerreno: r.area_terreno === null || r.area_terreno === undefined ? null : Number(r.area_terreno),
    codigo: r.codigo ?? null,
    source: r.source,
    sourcePropertyId: r.source_property_id,
    sourceCatalogPage: r.source_catalog_page ?? null,
    sourcePropertyUrl: r.source_property_url ?? null,
    sourceCatalogUrl: r.source_catalog_url ?? null,
    sourceImportBatch: r.source_import_batch ?? null,
    createdAt: r.created_at,
    coverUrl: extras.coverUrl ?? null,
    publications: extras.publications ?? [],
    removalState: r.removal_state ?? null,
    archivedAt: r.archived_at ?? null,
  };
}

/**
 * Capa e selos de publicação de um lote de imóveis.
 * As imagens ficam em bucket privado: a URL é assinada a cada listagem.
 */
async function loadListingExtras(
  supabase: {
    from: (table: string) => any;
    storage: { from: (bucket: string) => { createSignedUrls: (paths: string[], expires: number) => Promise<{ data: Array<{ path?: string | null; signedUrl: string }> | null }> } };
  },
  ids: string[],
) {
  const covers = new Map<string, string>();
  const publications = new Map<string, PropertyPublicationBadge[]>();
  if (!ids.length) return { covers, publications };

  const [{ data: images }, { data: links }] = await Promise.all([
    supabase
      .from("property_images")
      .select("property_id, storage_path, is_cover, position")
      .in("property_id", ids)
      .order("is_cover", { ascending: false })
      .order("position", { ascending: true }),
    supabase
      .from("property_provider_publications")
      .select("property_id, provider, status, external_property_id")
      .in("property_id", ids),
  ]);

  const pathByProperty = new Map<string, string>();
  for (const image of (images ?? []) as Array<{ property_id: string; storage_path: string }>) {
    if (!pathByProperty.has(image.property_id)) pathByProperty.set(image.property_id, image.storage_path);
  }
  const paths = Array.from(pathByProperty.values());
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("property-images").createSignedUrls(paths, 3600);
    const signedByPath = new Map((signed ?? []).map((item) => [item.path ?? "", item.signedUrl]));
    for (const [propertyId, path] of pathByProperty) {
      const url = signedByPath.get(path);
      if (url) covers.set(propertyId, url);
    }
  }

  for (const link of (links ?? []) as Array<{
    property_id: string;
    provider: PropertyPublicationBadge["provider"];
    status: string;
    external_property_id: string | null;
  }>) {
    const list = publications.get(link.property_id) ?? [];
    list.push({
      provider: link.provider,
      status: link.status,
      externalPropertyId: link.external_property_id,
    });
    publications.set(link.property_id, list);
  }

  return { covers, publications };
}

function escapeLike(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}


export type ListImoveisInput = {
  carteira?: "todas" | "cordial" | "morar";
  operacao?: "todos" | "venda" | "aluguel";
  tipo?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
};

export const listImoveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ListImoveisInput) => data ?? {})
  .handler(async ({ data, context }): Promise<{ items: Property[]; total: number; page: number; pageSize: number }> => {
    const page = Math.max(0, data.page ?? 0);
    const pageSize = Math.min(100, Math.max(1, data.pageSize ?? 24));

    let query = context.supabase
      .from("properties")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    // Imóveis retirados saem da listagem comum, mas continuam no banco.
    query = query.is("archived_at", null);
    if (data.carteira && data.carteira !== "todas") {
      // A aba de carteira reflete o vínculo real com o provedor
      // (property_provider_publications); `carteira` é apenas metadado de origem
      // e por isso não pode ser usada sozinha — era a causa dos chips trocados.
      const [{ data: links }, { data: allIds }] = await Promise.all([
        context.supabase.from("property_provider_publications").select("property_id, provider"),
        context.supabase.from("properties").select("id, carteira").is("archived_at", null),
      ]);
      const linkedAny = new Set<string>();
      const linkedProvider = new Set<string>();
      for (const link of (links ?? []) as Array<{ property_id: string; provider: string }>) {
        linkedAny.add(link.property_id);
        if (link.provider === data.carteira) linkedProvider.add(link.property_id);
      }
      const allowed = new Set(linkedProvider);
      for (const row of (allIds ?? []) as Array<{ id: string; carteira: string }>) {
        if (!linkedAny.has(row.id) && row.carteira === data.carteira) allowed.add(row.id);
      }
      query = query.in("id", allowed.size ? Array.from(allowed) : ["00000000-0000-0000-0000-000000000000"]);
    }

    if (data.operacao && data.operacao !== "todos") query = query.eq("operacao", data.operacao);
    if (data.tipo) query = query.eq("tipo", data.tipo);
    if (data.cidade) query = query.eq("cidade", data.cidade);
    if (data.bairro) query = query.eq("bairro", data.bairro);

    const term = data.search ? escapeLike(data.search) : "";
    if (term) {
      const like = `%${term}%`;
      query = query.or(
        [
          `codigo.ilike.${like}`,
          `referencia.ilike.${like}`,
          `source_property_id.ilike.${like}`,
          `tipo.ilike.${like}`,
          `localizacao_exibida.ilike.${like}`,
          `bairro.ilike.${like}`,
          `cidade.ilike.${like}`,
        ].join(","),
      );
    }

    const from = page * pageSize;
    const { data: rows, count, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Row[];
    const { covers, publications } = await loadListingExtras(
      context.supabase as never,
      list.map((row) => String((row as Record<string, unknown>)["id"])),
    );

    return {
      items: list.map((row) => {
        const id = String((row as Record<string, unknown>)["id"]);
        return mapRow(row, {
          coverUrl: covers.get(id) ?? null,
          publications: publications.get(id) ?? [],
        });
      }),
      total: count ?? 0,
      page,
      pageSize,
    };
  });

export const getImovel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<Property | null> => {
    const { data: row, error } = await context.supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const { covers, publications } = await loadListingExtras(context.supabase as never, [data.id]);
    return mapRow(row as Row, {
      coverUrl: covers.get(data.id) ?? null,
      publications: publications.get(data.id) ?? [],
    });
  });


export const getImoveisFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tipos: string[]; cidades: string[]; bairros: string[] }> => {
    const { data, error } = await context.supabase.from("properties").select("tipo, cidade, bairro");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ tipo: string | null; cidade: string | null; bairro: string | null }>;
    const uniq = (values: Array<string | null>) =>
      Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0))).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
    return {
      tipos: uniq(rows.map((r) => r.tipo)),
      cidades: uniq(rows.map((r) => r.cidade)),
      bairros: uniq(rows.map((r) => r.bairro)),
    };
  });

export type CreateImovelInput = {
  carteira: "cordial" | "morar";
  operacao: "venda" | "aluguel";
  tipo?: string | null;
  localizacaoExibida?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  valor?: number | null;
  dormitorios?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  areaPrincipal?: number | null;
  codigo?: string | null;
};

export const createImovel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateImovelInput) => data)
  .handler(async ({ data, context }): Promise<Property> => {
    const payload = {
      carteira: data.carteira,
      operacao: data.operacao,
      tipo: data.tipo ?? null,
      localizacao_exibida: data.localizacaoExibida ?? null,
      bairro: data.bairro ?? null,
      cidade: data.cidade ?? null,
      uf: data.uf ?? null,
      valor: data.valor ?? null,
      valor_modo: data.valor === null || data.valor === undefined ? "consulte" : "fixo",
      dormitorios: data.dormitorios ?? null,
      suites: data.suites ?? null,
      banheiros: data.banheiros ?? null,
      vagas: data.vagas ?? null,
      area_principal: data.areaPrincipal ?? null,
      codigo: data.codigo ?? null,
      source: "gestao_cordial",
      source_property_id: crypto.randomUUID(),
    };
    const { data: row, error } = await context.supabase
      .from("properties")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as Row);
  });
