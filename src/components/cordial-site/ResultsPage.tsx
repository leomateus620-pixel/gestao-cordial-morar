import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { SiteLink } from "./SiteShell";
export function ResultsPage({ result, search }: { result: SiteCatalog; search: SiteSearch }) {
  const [filters, setFilters] = useState(false);
  const [expanded, setExpanded] = useState(result.total === 0);
  const navigate = useNavigate();
  const change = (patch: Partial<SiteSearch>) =>
    void navigate({ to: "/site/buscar", search: { ...search, ...patch, pagina: 1 } });
  const chips = Object.entries(search).filter(
    ([k, v]) => k in searchLabels && v != null && v !== defaultSearch[k as keyof SiteSearch],
  );
  const pageCount = Math.ceil(result.total / result.pageSize);
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
          <h1>{title}</h1>
        </div>
        <button
          className="cs-button cs-filter-desktop"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <SlidersHorizontal size={18} />
          Pesquisa completa
        </button>
      </div>
      <div className="cs-quick-filters">
        <label>
          <span>Referência Cordial</span>
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
          <small>Digite a referência e pressione Enter</small>
        </label>
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
      {expanded && (
        <div className="cs-desktop-filter-panel">
          <SearchForm
            key={searchParams(search)}
            initial={search}
            onApplied={() => setExpanded(false)}
          />
        </div>
      )}
      <div className="cs-results-toolbar">
        <p role="status" aria-live="polite">
          <strong>{result.total}</strong>{" "}
          {result.total === 1 ? "imóvel encontrado" : "imóveis encontrados"}
        </p>
        <div>
          <Dialog.Root open={filters} onOpenChange={setFilters}>
            <Dialog.Trigger className="cs-button cs-button-light cs-mobile-filter">
              <SlidersHorizontal size={18} />
              Filtros{chips.length > 0 ? ` (${chips.length})` : ""}
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="cordial-site cs-dialog-overlay" />
              <Dialog.Content className="cordial-site cs-drawer cs-filter-drawer">
                <Dialog.Title>Encontre seu imóvel</Dialog.Title>
                <Dialog.Description>
                  Combine filtros e aplique para ver os resultados.
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
                      to: "/site/buscar",
                      search: { ...search, visualizacao: v as SiteSearch["visualizacao"] },
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
      {result.items.length ? (
        <div
          className={`cs-property-grid ${search.visualizacao === "lista" ? "cs-property-list" : ""}`}
        >
          {result.items.map((p, i) => (
            <PropertyCard property={p} key={p.id} priority={i === 0} />
          ))}
        </div>
      ) : (
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
      )}
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
