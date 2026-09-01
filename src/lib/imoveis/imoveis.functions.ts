import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { watermarkLabel, type WatermarkVariant } from "@/lib/imoveis/watermark-config";
import { buildStablePublicUrl } from "@/lib/imobibrasil/public-url";
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
  codigoCordial: "codigo_cordial",
  codigoMorar: "codigo_morar",
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
  proprietarioTelefone: "proprietario_telefone",
  proprietarioEmail: "proprietario_email",
  observacaoImovel: "observacao_imovel",
  outrasInformacoes: "outras_informacoes",
  localizacaoMapsUrl: "localizacao_maps_url",
  corretorId: "corretor_id",
  corretorNome: "corretor_nome",
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
      .select("property_id, provider, status, external_property_id, external_public_url")
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
    external_public_url: string | null;
  }>) {
    const list = publications.get(link.property_id) ?? [];
    list.push({
      provider: link.provider,
      status: link.status,
      externalPropertyId: link.external_property_id,
      publicUrl:
        link.external_public_url ?? buildStablePublicUrl(link.provider, link.external_property_id),
    });
    publications.set(link.property_id, list);
  }


  return { covers, publications };
}

function escapeLike(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}


export type ImoveisSort =
  | "recentes"
  | "codigo"
  | "preco_asc"
  | "preco_desc"
  | "area_desc";

export type ListImoveisInput = {
  carteira?: "todas" | "cordial" | "morar" | "ambas";
  operacao?: "todos" | "venda" | "aluguel";
  tipo?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  search?: string | null;
  valorMin?: number | null;
  valorMax?: number | null;
  dormitoriosMin?: number | null;
  suitesMin?: number | null;
  banheirosMin?: number | null;
  vagasMin?: number | null;
  areaMin?: number | null;
  areaMax?: number | null;
  statusPublicacao?: string | null;
  /** "ocultar" (padrão) esconde arquivados; "somente" mostra apenas os arquivados. */
  arquivados?: "ocultar" | "somente";
  sort?: ImoveisSort;
  page?: number;
  pageSize?: number;
};

export const listImoveis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ListImoveisInput) => data ?? {})
  .handler(async ({ data, context }): Promise<{ items: Property[]; total: number; page: number; pageSize: number }> => {
    const page = Math.max(0, data.page ?? 0);
    const pageSize = Math.min(100, Math.max(1, data.pageSize ?? 24));

    // A view `properties_catalog` resolve, no banco, em quais sites o imóvel
    // está publicado (ou a carteira de origem quando ainda não há vínculo).
    let query = context.supabase.from("properties_catalog").select("*", { count: "exact" });

    // Arquivados ficam guardados no sistema, mas fora do catálogo ativo.
    query =
      data.arquivados === "somente"
        ? query.not("archived_at", "is", null)
        : query.is("archived_at", null);

    if (data.carteira === "ambas") {
      query = query.contains("providers", ["cordial"]).contains("providers", ["morar"]);
    } else if (data.carteira && data.carteira !== "todas") {
      query = query.contains("providers", [data.carteira]);
    }

    if (data.operacao && data.operacao !== "todos") query = query.eq("operacao", data.operacao);
    if (data.tipo) query = query.eq("tipo", data.tipo);
    if (data.cidade) query = query.eq("cidade", data.cidade);
    if (data.bairro) query = query.eq("bairro", data.bairro);
    if (data.statusPublicacao) query = query.contains("publication_statuses", [data.statusPublicacao]);

    if (typeof data.valorMin === "number") query = query.gte("valor", data.valorMin);
    if (typeof data.valorMax === "number") query = query.lte("valor", data.valorMax);
    if (typeof data.dormitoriosMin === "number") query = query.gte("dormitorios", data.dormitoriosMin);
    if (typeof data.suitesMin === "number") query = query.gte("suites", data.suitesMin);
    if (typeof data.banheirosMin === "number") query = query.gte("banheiros", data.banheirosMin);
    if (typeof data.vagasMin === "number") query = query.gte("vagas", data.vagasMin);
    if (typeof data.areaMin === "number") query = query.gte("area_principal", data.areaMin);
    if (typeof data.areaMax === "number") query = query.lte("area_principal", data.areaMax);

    const term = data.search ? escapeLike(data.search) : "";
    if (term) {
      const like = `%${term}%`;
      query = query.or(
        [
          `codigo.ilike.${like}`,
          `codigo_cordial.ilike.${like}`,
          `codigo_morar.ilike.${like}`,
          `referencia.ilike.${like}`,
          `source_property_id.ilike.${like}`,
          `tipo.ilike.${like}`,
          `localizacao_exibida.ilike.${like}`,
          `logradouro.ilike.${like}`,
          `bairro.ilike.${like}`,
          `cidade.ilike.${like}`,
        ].join(","),
      );
    }

    switch (data.sort) {
      case "codigo":
        query = query.order("codigo", { ascending: true, nullsFirst: false });
        break;
      case "preco_asc":
        query = query.order("valor", { ascending: true, nullsFirst: false });
        break;
      case "preco_desc":
        query = query.order("valor", { ascending: false, nullsFirst: false });
        break;
      case "area_desc":
        query = query.order("area_principal", { ascending: false, nullsFirst: false });
        break;
      case "recentes":
        query = query.order("updated_at", { ascending: false, nullsFirst: false });
        break;
      default:
        query = query.order("created_at", { ascending: true });
    }
    query = query.order("id", { ascending: true });

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

function mapDetail(row: Record<string, any>, extras: {
  coverUrl: string | null;
  publications: PropertyPublicationBadge[];
  images: PropertyImage[];
}): PropertyDetail {
  const base = mapRow(row as Row, { coverUrl: extras.coverUrl, publications: extras.publications });
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...base,
    finalidade: row.finalidade ?? null,
    codigoCordial: row.codigo_cordial ?? null,
    codigoMorar: row.codigo_morar ?? null,
    referencia: row.referencia ?? null,
    cep: row.cep ?? null,
    logradouro: row.logradouro ?? null,
    numero: row.numero ?? null,
    zona: row.zona ?? null,
    regiao: row.regiao ?? null,
    salas: row.salas ?? null,
    mobiliado: row.mobiliado ?? null,
    valorIptu: num(row.valor_iptu),
    valorCondominio: num(row.valor_condominio),
    aceitaFinanciamento: row.aceita_financiamento ?? null,
    permuta: row.permuta ?? null,
    descricaoImovel: row.descricao_imovel ?? null,
    pontosFortes: row.pontos_fortes ?? null,
    exclusividade: row.exclusividade ?? null,
    autorizacao: row.autorizacao ?? null,
    escriturada: row.escriturada ?? null,
    averbada: row.averbada ?? null,
    comPlaca: row.com_placa ?? null,
    disponibilidade: row.disponibilidade ?? null,
    exibirImovel: row.exibir_imovel ?? null,
    destaqueInicial: row.destaque_inicial ?? null,
    proprietarioNome: row.proprietario_nome ?? null,
    proprietarioTelefone: row.proprietario_telefone ?? null,
    proprietarioEmail: row.proprietario_email ?? null,
    observacaoImovel: row.observacao_imovel ?? null,
    outrasInformacoes: row.outras_informacoes ?? null,
    localizacaoMapsUrl: row.localizacao_maps_url ?? null,
    localizacaoMapsCoords: row.localizacao_maps_coords ?? null,
    corretorId: row.corretor_id ?? null,
    corretorNome: row.corretor_nome ?? null,
    origemCaptacao: row.origem_captacao ?? null,
    nomeEmpreendimento: row.nome_empreendimento ?? null,
    unidade: row.unidade ?? null,
    revision: Number(row.revision ?? 1),
    updatedAt: row.updated_at ?? null,
    isDraft: row.is_draft ?? false,
    images: extras.images,
  };
}

/** Ficha completa: dados canônicos + galeria assinada + publicações, sem N+1. */
export const getPropertyDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<PropertyDetail | null> => {
    const [{ data: row, error }, { data: imageRows }, { data: links }] = await Promise.all([
      context.supabase.from("properties").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("property_images")
        .select(
          "id, storage_path, processed_storage_path, is_cover, position, processing_status, processing_error_message, watermark_variant",
        )
        .eq("property_id", data.id)
        .order("is_cover", { ascending: false })
        .order("position", { ascending: true }),
      context.supabase
        .from("property_provider_publications")
        .select("provider, status, external_property_id, external_public_url")
        .eq("property_id", data.id),
    ]);
    if (error) throw new Error(error.message);
    if (!row) return null;

    const rows = (imageRows ?? []) as Array<{
      id: string;
      storage_path: string;
      processed_storage_path: string | null;
      is_cover: boolean;
      position: number;
      processing_status: string | null;
      processing_error_message: string | null;
      watermark_variant: string | null;
    }>;
    const images: PropertyImage[] = [];
    if (rows.length) {
      const { data: signed } = await context.supabase.storage
        .from("property-images")
        .createSignedUrls(rows.map((r) => r.processed_storage_path ?? r.storage_path), 3600);
      const byPath = new Map(
        ((signed ?? []) as Array<{ path?: string | null; signedUrl: string }>).map((s) => [
          s.path ?? "",
          s.signedUrl,
        ]),
      );
      for (const r of rows) {
        const url = byPath.get(r.processed_storage_path ?? r.storage_path);
        if (url)
          images.push({
            id: r.id,
            url,
            isCover: r.is_cover,
            position: r.position,
            processingStatus: (r.processing_status ?? "ready") as PropertyImage["processingStatus"],
            watermarkLabel: r.watermark_variant
              ? watermarkLabel(r.watermark_variant as WatermarkVariant)
              : null,
            processingError: r.processing_error_message,
          });
      }
    }

    const publications = ((links ?? []) as Array<{
      provider: PropertyPublicationBadge["provider"];
      status: string;
      external_property_id: string | null;
      external_public_url: string | null;
    }>).map((link) => ({
      provider: link.provider,
      status: link.status,
      externalPropertyId: link.external_property_id,
      publicUrl:
        link.external_public_url ?? buildStablePublicUrl(link.provider, link.external_property_id),
    }));


    return mapDetail(row as Record<string, any>, {
      coverUrl: images[0]?.url ?? null,
      publications,
      images,
    });
  });

export type CreateImovelInput = Partial<PropertyWriteInput> & {
  carteira: "cordial" | "morar";
  operacao: "venda" | "aluguel";
};

export const createImovel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateImovelInput) => data)
  .handler(async ({ data, context }): Promise<Property> => {
    const payload = {
      ...toDbPayload(data),
      valor_modo: data.valorModo ?? (data.valor === null || data.valor === undefined ? "consulte" : "fixo"),
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

export type UpdateImovelInput = { id: string } & Partial<PropertyWriteInput>;

/**
 * Salva a edição local, incrementa a revisão e enfileira `update` apenas para
 * provedores já vinculados — nunca cria publicação nova a partir da edição.
 */
export const updateImovel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: UpdateImovelInput) => data)
  .handler(async ({ data, context }): Promise<{ property: PropertyDetail | null; queued: string[] }> => {
    const { id, ...rest } = data;
    const payload = toDbPayload(rest);
    if (!Object.keys(payload).length) throw new Error("Nada para salvar.");

    const { data: current, error: readError } = await context.supabase
      .from("properties")
      .select("revision")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Imóvel não encontrado ou sem permissão.");

    const revision = Number((current as { revision?: number }).revision ?? 1) + 1;
    const { data: row, error } = await context.supabase
      .from("properties")
      .update({ ...payload, revision, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { data: links } = await context.supabase
      .from("property_provider_publications")
      .select("provider, enabled, status, external_property_id")
      .eq("property_id", id);

    const targets = ((links ?? []) as Array<{
      provider: string;
      enabled: boolean;
      external_property_id: string | null;
    }>)
      .filter((link) => link.enabled && link.external_property_id)
      .map((link) => link.provider) as Array<"cordial" | "morar">;

    if (targets.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("property_sync_jobs").upsert(
        targets.map((provider) => ({
          property_id: id,
          provider,
          action: "update" as const,
          requested_revision: revision,
          requested_by: context.userId,
          status: "pending" as const,
          next_run_at: new Date().toISOString(),
        })),
        { onConflict: "property_id,provider,action,requested_revision" },
      );
      await supabaseAdmin
        .from("property_provider_publications")
        .update({ status: "pending" })
        .eq("property_id", id)
        .in("provider", targets);
    }

    return {
      property: mapDetail(row as Record<string, any>, {
        coverUrl: null,
        publications: [],
        images: [],
      }),
      queued: targets,
    };
  });


export type DeleteImovelResult = {
  status: "deleted" | "pending_removal";
  providers: string[];
};

/**
 * Exclui o imóvel do Gestão Cordial. Se ele estiver publicado, primeiro
 * enfileira a remoção nos sites; o cadastro só é apagado quando os provedores
 * confirmarem (ver `finalizePendingRemoval`).
 */
export const deleteImovel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<DeleteImovelResult> => {
    const { id } = data;

    const { data: current, error: readError } = await context.supabase
      .from("properties")
      .select("id, revision")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Imóvel não encontrado ou sem permissão.");

    const { data: links } = await context.supabase
      .from("property_provider_publications")
      .select("provider, enabled, external_property_id")
      .eq("property_id", id);

    const live = ((links ?? []) as Array<{
      provider: string;
      enabled: boolean;
      external_property_id: string | null;
    }>).filter((link) => link.external_property_id) as Array<{
      provider: "cordial" | "morar";
      enabled: boolean;
      external_property_id: string | null;
    }>;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (live.length) {
      const revision = Number((current as { revision?: number }).revision ?? 1);
      await supabaseAdmin.from("property_sync_jobs").upsert(
        live.map((link) => ({
          property_id: id,
          provider: link.provider,
          action: "delete" as const,
          requested_revision: revision,
          requested_by: context.userId,
          status: "pending" as const,
          next_run_at: new Date().toISOString(),
        })),
        { onConflict: "property_id,provider,action,requested_revision" },
      );
      await supabaseAdmin
        .from("properties")
        .update({ removal_state: "pending_removal", updated_at: new Date().toISOString() })
        .eq("id", id);
      return { status: "pending_removal", providers: live.map((link) => link.provider) };
    }

    const { purgeProperty } = await import("@/lib/imoveis/purge.server");
    await purgeProperty(supabaseAdmin, id);
    return { status: "deleted", providers: [] };
  });

export type ArchiveImovelResult = {
  status: "archived" | "pending_archive";
  providers: string[];
};

/**
 * Arquiva o imóvel: o anúncio sai dos sites (ação `unpublish`), mas o cadastro,
 * fotos, vídeos, códigos e histórico continuam guardados no Gestão Cordial.
 * Quando há publicação viva, o arquivamento termina assim que os provedores
 * confirmarem a despublicação (ver `finalizePendingArchive`).
 */
export const archiveImovel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<ArchiveImovelResult> => {
    const { id } = data;

    const { data: current, error: readError } = await context.supabase
      .from("properties")
      .select("id, revision")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Imóvel não encontrado ou sem permissão.");

    const { data: links } = await context.supabase
      .from("property_provider_publications")
      .select("provider, enabled, status, external_property_id")
      .eq("property_id", id);

    const live = ((links ?? []) as Array<{
      provider: "cordial" | "morar";
      enabled: boolean;
      status: string | null;
      external_property_id: string | null;
    }>).filter((link) => link.external_property_id && link.status !== "unpublished");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    if (live.length) {
      const revision = Number((current as { revision?: number }).revision ?? 1);
      await supabaseAdmin.from("property_sync_jobs").upsert(
        live.map((link) => ({
          property_id: id,
          provider: link.provider,
          action: "unpublish" as const,
          requested_revision: revision,
          requested_by: context.userId,
          status: "pending" as const,
          next_run_at: now,
        })),
        { onConflict: "property_id,provider,action,requested_revision" },
      );
      const { error } = await supabaseAdmin
        .from("properties")
        .update({ removal_state: "pending_archive", updated_at: now })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return { status: "pending_archive", providers: live.map((link) => link.provider) };
    }

    const { error } = await supabaseAdmin
      .from("properties")
      .update({ archived_at: now, removal_state: "archived", updated_at: now })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { status: "archived", providers: [] };
  });

/** Reativa um imóvel arquivado: volta ao catálogo, sem republicar automaticamente. */
export const unarchiveImovel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ status: "active" }> => {
    const { data: current, error: readError } = await context.supabase
      .from("properties")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Imóvel não encontrado ou sem permissão.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("properties")
      .update({ archived_at: null, removal_state: null, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { status: "active" };
  });
