import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";
import { Fab } from "@/components/fab";
import { NovoImovelSheet } from "@/components/sheets/novo-imovel";
import { EmptyState } from "@/components/shared/empty-state";
import { PropertyCatalogCard } from "@/components/imoveis/PropertyCatalogCard";
import { SiteSyncPanel } from "@/components/imoveis/SiteSyncPanel";
import { useImoveisList } from "@/hooks/useImoveis";


const filters = ["Todos", "Venda", "Aluguel"] as const;
const PAGE_SIZE = 24;

export const Route = createFileRoute("/_app/imoveis")({
  head: () => ({
    meta: [
      { title: "Imóveis — Gestão Cordial" },
      {
        name: "description",
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
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<(typeof filters)[number]>("Todos");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const agency = useApp((s) => s.agency);
  const isAdmin = isAdminUser(useSession());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [f, debounced, agency]);

  const filterInput = useMemo(
    () => ({
      carteira: agency === "todas" ? ("todas" as const) : agency,
      operacao:
        f === "Todos" ? ("todos" as const) : f === "Venda" ? ("venda" as const) : ("aluguel" as const),
      search: debounced || null,
      page,
      pageSize: PAGE_SIZE,
    }),
    [agency, f, debounced, page],
  );

  const query = useImoveisList(filterInput);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteSyncPanel isAdmin={isAdmin} />

      <div className="mb-3 flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2 backdrop-blur">
        <Search className="size-4 shrink-0 text-foreground/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código, cidade, bairro ou tipo…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-foreground/35"
        />
        {query.isFetching && <Loader2 className="size-4 animate-spin text-foreground/35" />}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters.map((x) => (
          <button
            key={x}
            onClick={() => setF(x)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (f === x
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {x}
          </button>
        ))}
        <span className="ml-auto text-[11px] font-medium text-foreground/45">
          {total} {total === 1 ? "imóvel" : "imóveis"}
        </span>
      </div>

      <div className="space-y-3">
        {query.isPending &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/45" />
          ))}

        {!query.isPending &&
          items.map((im) => <PropertyCatalogCard key={im.id} property={im} />)}

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
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="glass-panel rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-[11px] font-medium text-foreground/50">
            Página {page + 1} de {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="glass-panel rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      <Fab onClick={() => setOpen(true)} label="Novo imóvel" />
      <NovoImovelSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
