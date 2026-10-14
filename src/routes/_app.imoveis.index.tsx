import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PhotoLightbox } from "@/components/imoveis/PhotoLightbox";
import { SelectionBar, SelectionReviewSheet } from "@/components/selecoes/SelectionPanel";
import { listCatalogPhotos } from "@/lib/selecoes/selecoes.functions";
import { bindSelectionDraft, selectionDraft, useSelectionDraft } from "@/lib/selecoes/draft-store";
import { suggestTitle } from "@/lib/selecoes/rules";
import { rememberCatalogSearch, takeCatalogAnchor } from "@/lib/imoveis/search-memory";
import { useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import type { Property } from "@/types/property";
import { SearchX } from "lucide-react";
import { Fab } from "@/components/fab";
import { EmptyState } from "@/components/shared/empty-state";
import {
  PropertyCatalogCard,
  PropertyCatalogCardSkeleton,
  type CatalogView,
} from "@/components/imoveis/PropertyCatalogCard";
import { PropertyFilterBar } from "@/components/imoveis/PropertyFilterBar";
import { CatalogToolbar } from "@/components/imoveis/catalog/CatalogToolbar";
import { CatalogPagination } from "@/components/imoveis/catalog/CatalogPagination";
import { useImoveisFacets, useImoveisList } from "@/hooks/useImoveis";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  parseCatalogSearch,
  serializeCatalogSearch,
  toListInput,
  type CatalogFilters,
} from "@/lib/imoveis/filters";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;
const VIEW_STORAGE_KEY = "cordial:imoveis:view";

export const Route = createFileRoute("/_app/imoveis/")({
  validateSearch: (search: Record<string, unknown>) =>
    serializeCatalogSearch(parseCatalogSearch(search)),
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

/** Preferência de visualização (cartões/lista) persistida no navegador, sem quebrar o SSR. */
function useCatalogView(): [CatalogView, (view: CatalogView) => void] {
  const [view, setView] = useState<CatalogView>("grid");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      // Sem storage disponível a lista segue em cartões.
    }
  }, []);

  const update = useCallback((next: CatalogView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Preferência apenas para a sessão atual.
    }
  }, []);

  return [view, update];
}

function summaryFor(filters: CatalogFilters): string {
  const parts: string[] = [];
  parts.push(filters.arquivados === "somente" ? "Arquivados" : "Catálogo ativo");
  if (filters.carteira === "cordial") parts.push("Cordial");
  if (filters.carteira === "morar") parts.push("Morar");
  if (filters.carteira === "ambas") parts.push("Cordial + Morar");
  if (filters.q.trim()) parts.push(`“${filters.q.trim()}”`);
  return parts.join(" · ");
}

function Page() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [view, setView] = useCatalogView();

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
    // Busca e carteira vivem no cabeçalho — limpar filtros não deve apagá-las.
    navigate({
      to: "/imoveis",
      search: serializeCatalogSearch({
        ...DEFAULT_FILTERS,
        q: filters.q,
        carteira: filters.carteira,
      }),
      replace: true,
    });
  }, [filters.carteira, filters.q, navigate]);

  const goToPage = useCallback(
    (page: number) => {
      applyFilters({ page });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [applyFilters],
  );

  const query = useImoveisList(toListInput(filters, PAGE_SIZE));
  const facets = useImoveisFacets();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const hasFilters = countActiveFilters(filters) > 0 || filters.q.trim().length > 0;

  // Memória da busca: guarda a pesquisa atual para o "voltar" da ficha.
  useEffect(() => {
    rememberCatalogSearch(serializeCatalogSearch(filters));
  }, [filters]);

  // Ao voltar da ficha, rola até o imóvel visitado assim que a lista chega.
  const anchorRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (anchorRef.current === undefined) anchorRef.current = takeCatalogAnchor();
    const id = anchorRef.current;
    if (!id || query.isPending) return;
    anchorRef.current = null;
    if (!items.some((im) => im.id === id)) return;
    // Depois da restauração de rolagem do roteador, ancora no imóvel visitado.
    const scroll = () => document.getElementById(`imovel-${id}`)?.scrollIntoView({ block: "center" });
    const timers = [window.setTimeout(scroll, 60), window.setTimeout(scroll, 350)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [items, query.isPending]);

  // Fotos da página atual (só URLs; as imagens carregam sob demanda).
  const fetchPhotos = useServerFn(listCatalogPhotos);
  const pageIds = useMemo(() => items.map((im) => im.id), [items]);
  const photos = useQuery({
    queryKey: ["catalog-photos", pageIds],
    queryFn: () => fetchPhotos({ data: { ids: pageIds } }),
    enabled: pageIds.length > 0,
    staleTime: 30 * 60_000,
  });

  // Seleção do corretor (rascunho por usuário).
  const session = useSession();
  useEffect(() => bindSelectionDraft(session?.id ?? null), [session?.id]);
  const draft = useSelectionDraft();
  const selectedSet = useMemo(() => new Set(draft.ids), [draft.ids]);
  const toggleSelect = useCallback((id: string) => selectionDraft.toggle(id), []);
  const [sheet, setSheet] = useState<{ open: boolean; step: "review" | "create" }>({ open: false, step: "review" });
  const agencyFilter = useApp((s) => s.agency);

  const [lightbox, setLightbox] = useState<{ title: string; photos: string[]; index: number } | null>(null);
  const openLightbox = useCallback((p: Property, list: string[], index: number) => {
    setLightbox({ title: `${p.tipo ?? "Imóvel"} ${[p.codigoCordial, p.codigoMorar].filter(Boolean).join(" / ")}`.trim(), photos: list, index });
  }, []);

  const gridClass =
    view === "grid"
      ? "grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4"
      : "flex flex-col gap-2.5";

  return (
    <div className="space-y-4">
      <CatalogToolbar
        total={total}
        loading={query.isFetching}
        summary={summaryFor(filters)}
        view={view}
        onViewChange={setView}
      />

      <PropertyFilterBar
        filters={filters}
        facets={facets.data}
        total={total}
        onChange={applyFilters}
        onReset={resetFilters}
        className="lg:sticky lg:top-[4.5rem] lg:z-20 lg:-mx-2 lg:rounded-2xl lg:bg-[rgba(245,241,235,0.82)] lg:px-2 lg:py-1.5 lg:backdrop-blur-xl"
      />

      <div
        className={cn(
          gridClass,
          query.isFetching && !query.isPending && "opacity-70 transition-opacity",
        )}
        aria-busy={query.isFetching}
      >
        {query.isPending &&
          Array.from({ length: view === "grid" ? 6 : 5 }).map((_, i) => (
            <PropertyCatalogCardSkeleton key={i} view={view} />
          ))}

        {!query.isPending &&
          items.map((im) => (
            <PropertyCatalogCard
              key={im.id}
              property={im}
              view={view}
              photos={photos.data?.[im.id]}
              selected={selectedSet.has(im.id)}
              onToggleSelect={toggleSelect}
              onExpand={openLightbox}
            />
          ))}
      </div>

      {query.isError && (
        <EmptyState
          title="Não foi possível carregar os imóveis"
          description={(query.error as Error)?.message ?? "Tente novamente em instantes."}
        />
      )}

      {!query.isPending && !query.isError && items.length === 0 && (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title="Nenhum imóvel encontrado"
          description={
            hasFilters
              ? "Nenhum imóvel combina com a busca e os filtros atuais."
              : "Cadastre o primeiro imóvel do catálogo pelo botão Novo imóvel."
          }
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={() => navigate({ to: "/imoveis", search: {}, replace: true })}
                className="inline-flex h-10 items-center rounded-full border border-primary/25 bg-primary/10 px-4 text-[12px] font-semibold text-primary transition hover:bg-primary/15"
              >
                Limpar busca e filtros
              </button>
            ) : undefined
          }
        />
      )}

      <CatalogPagination
        page={filters.page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={goToPage}
        className="pt-2"
      />

      {draft.ids.length || draft.editingId ? <div aria-hidden className="h-24" /> : null}

      <SelectionBar onReview={(step) => setSheet({ open: true, step })} />
      <SelectionReviewSheet
        open={sheet.open}
        initialStep={sheet.step}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        suggestedTitle={suggestTitle({
          tipo: filters.tipo,
          cidade: filters.cidade,
          bairro: filters.bairro,
          operacao: filters.operacao,
          valorMax: filters.valorMax,
        })}
        defaultAgency={agencyFilter === "morar" ? "morar" : "cordial"}
      />
      <PhotoLightbox
        open={!!lightbox}
        onOpenChange={(open) => !open && setLightbox(null)}
        photos={lightbox?.photos ?? []}
        startIndex={lightbox?.index ?? 0}
        title={lightbox?.title ?? ""}
      />

      <Fab
        onClick={() => navigate({ to: "/imoveis/novo" })}
        label="Novo imóvel"
        className="lg:hidden"
      />
    </div>
  );
}

export { DEFAULT_FILTERS };
