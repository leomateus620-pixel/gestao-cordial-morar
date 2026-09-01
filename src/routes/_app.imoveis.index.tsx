import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useCallback, useMemo } from "react";
import { Plus } from "lucide-react";
import { Fab } from "@/components/fab";
import { EmptyState } from "@/components/shared/empty-state";
import { PropertyCatalogCard } from "@/components/imoveis/PropertyCatalogCard";
import { PropertyFilterBar } from "@/components/imoveis/PropertyFilterBar";
import { useImoveisFacets, useImoveisList } from "@/hooks/useImoveis";
import {
  DEFAULT_FILTERS,
  parseCatalogSearch,
  serializeCatalogSearch,
  toListInput,
  type CatalogFilters,
} from "@/lib/imoveis/filters";

const PAGE_SIZE = 24;

export const Route = createFileRoute("/_app/imoveis/")({
  validateSearch: (search: Record<string, unknown>) => serializeCatalogSearch(parseCatalogSearch(search)),
  head: () => ({
    meta: [
      { title: "Imóveis — Gestão Cordial" },
      {
        name: "description",
        content: "Catálogo real de imóveis das carteiras Cordial e Morar.",
      },
      { property: "og:title", content: "Imóveis — Gestão Cordial" },
      {
        property: "og:description",
        content: "Catálogo real de imóveis das carteiras Cordial e Morar.",
      },
    ],
  }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="imoveis">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const filters = useMemo(() => parseCatalogSearch(search as Record<string, unknown>), [search]);

  // A URL é a fonte de verdade dos filtros: links e recargas mantêm a mesma lista.
  const applyFilters = useCallback(
    (patch: Partial<CatalogFilters>) => {
      navigate({
        to: "/imoveis",
        search: serializeCatalogSearch({ ...filters, ...patch }),
        replace: true,
      });
    },
    [filters, navigate],
  );

  const resetFilters = useCallback(() => {
    navigate({ to: "/imoveis", search: {}, replace: true });
  }, [navigate]);

  const query = useImoveisList(toListInput(filters, PAGE_SIZE));
  const facets = useImoveisFacets();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="mb-3 flex justify-start">
        <Link
          to="/imoveis/novo"
          className="hidden items-center gap-2 rounded-2xl border border-primary/20 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition hover:brightness-110 lg:inline-flex"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Novo imóvel
        </Link>
      </div>

      <PropertyFilterBar
        filters={filters}
        facets={facets.data}
        total={total}
        loading={query.isFetching}
        onChange={applyFilters}
        onReset={resetFilters}
      />


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {query.isPending &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-white/45" />
          ))}

        {!query.isPending && items.map((im) => <PropertyCatalogCard key={im.id} property={im} />)}
      </div>

      {query.isError && (
        <EmptyState
          title="Não foi possível carregar os imóveis"
          description={(query.error as Error)?.message ?? "Tente novamente em instantes."}
        />
      )}

      {!query.isPending && !query.isError && items.length === 0 && (
        <EmptyState
          title="Nenhum imóvel encontrado"
          description="Ajuste a busca ou os filtros para ver outros imóveis do catálogo."
        />
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            disabled={filters.page === 0}
            onClick={() => applyFilters({ page: Math.max(0, filters.page - 1) })}
            className="glass-panel rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-[11px] font-medium text-foreground/50">
            Página {filters.page + 1} de {totalPages}
          </span>
          <button
            disabled={filters.page + 1 >= totalPages}
            onClick={() => applyFilters({ page: filters.page + 1 })}
            className="glass-panel rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      <Fab onClick={() => navigate({ to: "/imoveis/novo" })} label="Novo imóvel" />
    </>
  );
}

export { DEFAULT_FILTERS };
