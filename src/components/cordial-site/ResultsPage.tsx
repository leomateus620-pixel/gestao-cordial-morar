import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
  ArrowLeft,
  ArrowRight,
  SearchX,
} from "lucide-react";
import {
  defaultSearch,
  searchParams,
  type SiteSearch,
  type SiteCatalog,
} from "@/lib/cordial-site/contract";
import { sitePath } from "@/lib/cordial-site/presentation";
import { PropertyCard } from "./PropertyCard";
import { SearchForm } from "./SearchForm";
import { searchLabels } from "@/lib/cordial-site/search-labels";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { useSiteBrand } from "@/lib/cordial-site/context";
import { SiteLink } from "./SiteShell";
import {
  readSearchCardOrigin,
  readSearchCardScroll,
  trackSiteEvent,
} from "@/lib/cordial-site/experience";
export function ResultsPage({
  result,
  search,
  failed = false,
  hasPrevious = false,
  onRetry,
}: {
  result: SiteCatalog;
  search: SiteSearch;
  failed?: boolean;
  hasPrevious?: boolean;
  onRetry?: () => void;
}) {
  const brand = useSiteBrand();
  const config = getSiteBrand(brand);
  const [filters, setFilters] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(!!search.referencia);
  const [expanded, setExpanded] = useState(brand === "morar" || result.total === 0);
  const refreshing = useRouterState({
    select: (state) => state.isLoading && state.location.pathname.endsWith("/buscar"),
  });
  const restoredCard = useRef<string | null>(null);
  useEffect(() => {
    if (brand !== "cordial" || refreshing) return;
    const propertyId = readSearchCardOrigin(brand);
    const originScroll = readSearchCardScroll(brand);
    if (!propertyId) {
      restoredCard.current = null;
      return;
    }
    const restoration = `${location.pathname}${location.search}:${propertyId}`;
    if (restoredCard.current === restoration) return;
    const frame = requestAnimationFrame(() => {
      // A user who already chose a field/modal must not be refocused by a later refresh.
      restoredCard.current = restoration;
      if (
        (document.activeElement && document.activeElement !== document.body) ||
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [aria-modal="true"]',
        )
      )
        return;
      const origin = document.querySelector<HTMLAnchorElement>(
        `a[data-public-property="${propertyId}"]`,
      );
      if (origin) {
        if (originScroll !== null) window.scrollTo({ top: originScroll, behavior: "instant" });
        origin.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [brand, result.items, refreshing]);
  const navigate = useNavigate();
  const change = (patch: Partial<SiteSearch>) => {
    if (brand === "cordial")
      trackSiteEvent("filter_changed", { source: `results:${Object.keys(patch).join(",")}` });
    void navigate({
      to: `${config.basePath}/buscar`,
      search: { ...search, ...patch, pagina: 1 },
      resetScroll: false,
    });
  };
  const chips = Object.entries(search).filter(
    ([k, v]) => k in searchLabels && v != null && v !== defaultSearch[k as keyof SiteSearch],
  );
  const pageCount = failed ? 0 : Math.ceil(result.total / result.pageSize);
  const title =
    search.finalidade === "venda"
      ? "Um lugar para chamar de seu."
      : search.finalidade === "aluguel"
        ? "Seu próximo lar está por aqui."
        : "Encontre o lugar do seu próximo capítulo.";
  return (
    <div className="cs-container cs-results-page">
      <nav className="cs-breadcrumb" aria-label="Caminho">
        <SiteLink to={sitePath("/")}>Início</SiteLink>
        <span>/</span>
        <span>Imóveis</span>
      </nav>
      <div className="cs-results-heading">
        <div>
          <p className="cs-eyebrow">
            {search.finalidade === "aluguel"
              ? "Imóveis para alugar"
              : search.finalidade === "venda"
                ? "Imóveis à venda"
                : "Comprar ou alugar"}
          </p>
          <h1>{brand === "cordial" ? "Encontre seu imóvel" : title}</h1>
        </div>
        {brand === "morar" && (
          <button
            className="cs-button cs-filter-desktop"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <SlidersHorizontal size={18} />
            Pesquisa completa
          </button>
        )}
      </div>
      <div className="cs-quick-filters">
        {brand === "cordial" && !search.referencia && (
          <button
            className="cs-button cs-button-light cs-reference-toggle"
            aria-expanded={referenceOpen}
            onClick={() => setReferenceOpen((value) => !value)}
          >
            Buscar por referência
          </button>
        )}
        {(brand === "morar" || referenceOpen || search.referencia) && (
          <label>
            <span>Referência {config.shortName}</span>
            <input
              id="referencia"
              key={search.referencia ?? ""}
              defaultValue={search.referencia ?? ""}
              placeholder="Buscar por código"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  change({ referencia: e.currentTarget.value || undefined, exata: "sim" });
              }}
            />
            <small>
              Digite a referência e pressione Enter
              {search.referencia && chips.some(([key]) => !["referencia", "exata"].includes(key))
                ? "; os demais filtros também se aplicam."
                : ""}
            </small>
            {search.referencia && chips.some(([key]) => !["referencia", "exata"].includes(key)) && (
              <button
                type="button"
                className="cs-text-link"
                onClick={() =>
                  void navigate({
                    to: `${config.basePath}/buscar`,
                    search: {
                      ...defaultSearch,
                      referencia: search.referencia,
                      exata: search.exata,
                      visualizacao: search.visualizacao,
                    },
                  })
                }
              >
                Pesquisar somente esta referência
              </button>
            )}
          </label>
        )}
        <div className="cs-result-purpose">
          {[
            ["", "Todos"],
            ["venda", "Comprar"],
            ["aluguel", "Alugar"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={(search.finalidade ?? "") === v ? "is-active" : ""}
              aria-pressed={(search.finalidade ?? "") === v}
              onClick={() => change({ finalidade: v ? (v as "venda" | "aluguel") : undefined })}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {brand === "morar" && expanded && (
        <div className="cs-desktop-filter-panel">
          <SearchForm
            key={searchParams(search)}
            initial={search}
            onApplied={() => setExpanded(false)}
          />
        </div>
      )}
      <div className="cs-results-toolbar">
        <p role="status" aria-live="polite" aria-busy={refreshing}>
          {failed ? (
            hasPrevious ? (
              "Resultados da última busca confirmada"
            ) : (
              "Quantidade não confirmada"
            )
          ) : (
            <>
              <strong>{result.total}</strong>{" "}
              {result.total === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            </>
          )}
          {refreshing && <span className="cs-results-updating"> · Atualizando resultados…</span>}
        </p>
        <div>
          <Dialog.Root open={filters} onOpenChange={setFilters}>
            <Dialog.Trigger
              className={`cs-button cs-button-light ${brand === "morar" ? "cs-mobile-filter" : "cs-filter-trigger"}`}
            >
              <SlidersHorizontal size={18} />
              Filtros{chips.length > 0 ? ` (${chips.length})` : ""}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className={`${config.themeClass} cs-dialog-overlay`} />
              <Dialog.Content className={`${config.themeClass} cs-drawer cs-filter-drawer`}>
                <Dialog.Title>Encontre seu imóvel</Dialog.Title>
                <Dialog.Description>
                  Combine filtros e aplique uma vez. Fechar sem aplicar descarta as alterações.
                </Dialog.Description>
                <Dialog.Close
                  className="cs-icon-button cs-dialog-close"
                  aria-label="Fechar filtros"
                >
                  <X />
                </Dialog.Close>
                <SearchForm initial={search} onApplied={() => setFilters(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <label className="cs-sort">
            <span className="cs-sr-only">Ordenar imóveis</span>
            <select
              value={search.ordem}
              onChange={(e) => change({ ordem: e.target.value as SiteSearch["ordem"] })}
            >
              <option value="recentes">Publicados recentemente</option>
              <option value="preco_asc">Menor preço</option>
              <option value="preco_desc">Maior preço</option>
              <option value="area_desc">Maior área selecionada</option>
            </select>
          </label>
          <div className="cs-view-toggle" aria-label="Visualização">
            {[
              ["grade", LayoutGrid],
              ["lista", List],
            ].map(([v, Icon]) => {
              const I = Icon as typeof List;
              return (
                <button
                  key={String(v)}
                  className="cs-icon-button"
                  aria-label={v === "grade" ? "Exibir grade" : "Exibir lista"}
                  aria-pressed={search.visualizacao === v}
                  onClick={() =>
                    void navigate({
                      to: `${config.basePath}/buscar`,
                      search: { ...search, visualizacao: v as SiteSearch["visualizacao"] },
                      resetScroll: false,
                    })
                  }
                >
                  <I size={19} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="cs-filter-chips" aria-label="Filtros aplicados">
          {chips.map(([k, v]) => (
            <button
              key={k}
              onClick={() =>
                change({ [k]: undefined, ...(k === "cidade" ? { bairro: undefined } : {}) })
              }
              aria-label={`Remover ${searchLabels[k]}: ${v}`}
            >
              {searchLabels[k]}: {v}
              <X size={14} />
            </button>
          ))}
          <SiteLink to={sitePath("/buscar")}>Limpar tudo</SiteLink>
        </div>
      )}
      {failed && (
        <div className="cs-inline-state cs-results-error" role="alert">
          <p>
            Não foi possível atualizar esta busca. Seus filtros foram preservados.
            {hasPrevious
              ? " Os imóveis abaixo pertencem à última busca confirmada."
              : " Tente novamente para consultar os imóveis."}
          </p>
          <button className="cs-button cs-button-light" type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      )}
      {result.items.length ? (
        <div
          className={`cs-property-grid ${search.visualizacao === "lista" ? "cs-property-list" : ""}`}
        >
          {result.items.map((p, i) => (
            <PropertyCard property={p} key={p.id} priority={i === 0} />
          ))}
        </div>
      ) : !failed ? (
        <div className="cs-state">
          <SearchX size={38} />
          <h2>
            {result.total > 0
              ? "Esta página não tem imóveis."
              : "Ainda não encontramos essa combinação."}
          </h2>
          <p>
            {result.total > 0
              ? "O catálogo mudou. Volte à primeira página para ver os imóveis disponíveis."
              : "Experimente ampliar a faixa de valor, escolher outro bairro ou falar com a equipe."}
          </p>
          <SiteLink className="cs-button" to={sitePath("/buscar")}>
            Ver todos os imóveis <ArrowRight size={18} />
          </SiteLink>
        </div>
      ) : null}
      {pageCount > 1 && (
        <nav className="cs-pagination" aria-label="Paginação dos imóveis">
          {search.pagina > 1 ? (
            <SiteLink
              to={sitePath(`/buscar?${searchParams({ ...search, pagina: search.pagina - 1 })}`)}
              aria-label="Página anterior"
            >
              <ArrowLeft size={18} />
            </SiteLink>
          ) : (
            <span aria-disabled="true">
              <ArrowLeft size={18} />
            </span>
          )}
          {Array.from(
            new Set([
              1,
              ...Array.from({ length: 5 }, (_, i) => search.pagina - 2 + i).filter(
                (p) => p > 1 && p < pageCount,
              ),
              pageCount,
            ]),
          ).map((p) => (
            <SiteLink
              key={p}
              to={sitePath(`/buscar?${searchParams({ ...search, pagina: p })}`)}
              aria-current={p === search.pagina ? "page" : undefined}
            >
              {p}
            </SiteLink>
          ))}
          {search.pagina < pageCount ? (
            <SiteLink
              to={sitePath(`/buscar?${searchParams({ ...search, pagina: search.pagina + 1 })}`)}
              aria-label="Próxima página"
            >
              <ArrowRight size={18} />
            </SiteLink>
          ) : (
            <span aria-disabled="true">
              <ArrowRight size={18} />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
