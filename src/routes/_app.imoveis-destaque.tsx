import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Filter, Loader2, Search, Star } from "lucide-react";
import { useApp } from "@/store/app-store";
import { EmptyState } from "@/components/shared/empty-state";
import { PropertyCatalogCard } from "@/components/imoveis/PropertyCatalogCard";
import { useImoveisFacets, useImoveisList } from "@/hooks/useImoveis";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/imoveis-destaque")({
  head: () => ({
    meta: [
      { title: "Imóveis em Destaque — Gestão Cordial" },
      {
        name: "description",
        content: "Seleção de imóveis reais das carteiras Cordial e Morar, com filtros por tipo e cidade.",
      },
    ],
  }),
  component: Page,
});

const finalidades = ["Todos", "Venda", "Aluguel"] as const;

function Page() {
  const [finalidade, setFinalidade] = useState<(typeof finalidades)[number]>("Todos");
  const [tipo, setTipo] = useState<string | null>(null);
  const [cidade, setCidade] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const agency = useApp((s) => s.agency);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const facets = useImoveisFacets();

  const input = useMemo(
    () => ({
      carteira: agency === "todas" ? ("todas" as const) : agency,
      operacao:
        finalidade === "Todos"
          ? ("todos" as const)
          : finalidade === "Venda"
            ? ("venda" as const)
            : ("aluguel" as const),
      tipo,
      cidade,
      search: debounced || null,
      page: 0,
      pageSize: 24,
    }),
    [agency, finalidade, tipo, cidade, debounced],
  );

  const query = useImoveisList(input);
  const destaques = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <>
      <section
        className="mb-5 overflow-hidden rounded-3xl p-5 text-white"
        style={{
          background: "linear-gradient(135deg, #174d61 0%, #1e647d 45%, #2a3038 100%)",
          boxShadow: "0 24px 60px -20px rgba(23,27,33,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="grid size-12 shrink-0 place-items-center rounded-2xl"
            style={{ background: "rgba(95,175,199,0.2)" }}
          >
            <Star className="size-6" style={{ color: "#f0a86d" }} />
          </div>
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ color: "#f0a86d" }}
            >
              Carteira selecionada
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Imóveis em Destaque</h1>
            <p className="mt-0.5 text-[12px] text-white/60">
              {total} imóvel{total !== 1 ? "is" : ""} no catálogo
            </p>
          </div>
        </div>
      </section>

      <div
        className="mb-3 flex items-center gap-2 rounded-2xl px-3 py-2.5"
        style={{
          background: "rgba(255,255,255,0.65)",
          backdropFilter: "blur(18px) saturate(145%)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 4px 16px -8px rgba(23,27,33,0.08)",
        }}
      >
        <Search className="size-4 shrink-0 text-foreground/40" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código, bairro ou cidade..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/35"
        />
        {query.isFetching && <Loader2 className="size-4 animate-spin text-foreground/35" />}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all",
            showFilters
              ? "bg-primary text-white"
              : "bg-foreground/6 text-foreground/60 hover:bg-foreground/10",
          )}
        >
          <Filter className="size-3.5" />
          Filtros
        </button>
      </div>

      {showFilters && (
        <div
          className="mb-4 space-y-3 rounded-2xl p-4"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(18px) saturate(145%)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 4px 16px -8px rgba(23,27,33,0.08)",
          }}
        >
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-foreground/50">
              Finalidade
            </p>
            <div className="flex flex-wrap gap-2">
              {finalidades.map((f) => (
                <button
                  key={f}
                  onClick={() => setFinalidade(f)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
                    finalidade === f
                      ? "bg-primary text-white shadow-md shadow-primary/25"
                      : "bg-white/60 text-foreground/60 hover:bg-white/80",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-foreground/50">
                Tipo de imóvel
              </span>
              <select
                value={tipo ?? ""}
                onChange={(e) => setTipo(e.target.value || null)}
                className="w-full rounded-xl bg-white/70 px-3 py-2 text-sm outline-none"
              >
                <option value="">Todos</option>
                {(facets.data?.tipos ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-foreground/50">
                Cidade
              </span>
              <select
                value={cidade ?? ""}
                onChange={(e) => setCidade(e.target.value || null)}
                className="w-full rounded-xl bg-white/70 px-3 py-2 text-sm outline-none"
              >
                <option value="">Todas</option>
                {(facets.data?.cidades ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {query.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/45" />
          ))}
        </div>
      ) : destaques.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destaques.map((im) => (
            <PropertyCatalogCard key={im.id} property={im} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhum imóvel encontrado"
          description="Ajuste os filtros ou a busca para ver mais resultados."
          icon={<Building2 className="size-5" />}
        />
      )}
    </>
  );
}
