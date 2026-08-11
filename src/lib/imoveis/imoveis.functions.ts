import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Property } from "@/types/property";

type Row = Record<string, unknown>;

function mapRow(row: Row): Property {
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
  };
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

    if (data.carteira && data.carteira !== "todas") query = query.eq("carteira", data.carteira);
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

    return {
      items: ((rows ?? []) as Row[]).map(mapRow),
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
    return row ? mapRow(row as Row) : null;
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
