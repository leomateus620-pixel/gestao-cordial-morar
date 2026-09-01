import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { AgencySwitcher } from "@/components/agency-switcher";
import { parseCatalogSearch, serializeCatalogSearch, type CatalogFilters } from "@/lib/imoveis/filters";
import { cn } from "@/lib/utils";

/** Lê os filtros do catálogo direto da URL — a mesma fonte de verdade da lista. */
function useCatalogFilters() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const filters = useMemo(() => parseCatalogSearch(search ?? {}), [search]);

  const apply = (patch: Partial<CatalogFilters>) =>
    navigate({
      to: "/imoveis",
      search: serializeCatalogSearch({ ...filters, ...patch, page: 0 }),
      replace: true,
    });

  return { filters, apply };
}

/** Busca do catálogo dentro do header (substitui a busca global na rota /imoveis). */
export function CatalogSearchInput({ className }: { className?: string }) {
  const { filters, apply } = useCatalogFilters();
  const navigate = useNavigate();
  const [term, setTerm] = useState(filters.q);


  useEffect(() => setTerm(filters.q), [filters.q]);

  useEffect(() => {
    if (term === filters.q) return;
    const timer = setTimeout(() => apply({ q: term }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, filters.q]);

  return (
    <div
      className={cn(
        "glass-panel flex min-w-0 items-center gap-2 rounded-full border border-white/60 px-3 py-1.5 transition focus-within:border-primary/40",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-primary/70" />
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const q = term.trim();
          if (q.length < 2) return;
          event.preventDefault();
          navigate({ to: "/busca", search: { q } });
        }}
        placeholder="Código, bairro, cidade… (Enter = busca geral)"
        aria-label="Buscar no catálogo de imóveis. Pressione Enter para a busca geral do sistema."
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
      />

      {term.trim().length >= 2 ? (
        <button
          type="button"
          onClick={() => navigate({ to: "/busca", search: { q: term.trim() } })}
          className="hidden shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 sm:inline-flex"
        >
          Buscar em todo o sistema
        </button>
      ) : null}

      {term ? (
        <button
          type="button"
          onClick={() => setTerm("")}
          aria-label="Limpar busca"
          className="grid size-6 shrink-0 place-items-center rounded-full text-foreground/40 hover:text-foreground/70"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Pills Todas / Cordial / Morar controlando o filtro de carteira do catálogo. */
export function CatalogCarteiraPills({ className }: { className?: string }) {
  const { filters, apply } = useCatalogFilters();
  const value = filters.carteira === "ambas" ? "todas" : filters.carteira;

  return (
    <AgencySwitcher
      className={cn("w-auto sm:max-w-none", className)}
      value={value}
      onChange={(next) => apply({ carteira: next })}
    />
  );
}
