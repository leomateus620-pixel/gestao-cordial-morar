import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Loader2, Search, SearchX } from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { SectionHeader } from "@/components/section-header";
import { SearchResultCard } from "@/components/busca/SearchResultCard";
import { RecordTimelineDrawer } from "@/components/busca/RecordTimelineDrawer";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import {
  buscaCategoriaLabels,
  buscaCategoriaOrdem,
  type BuscaCategoria,
  type BuscaCategoriaFiltro,
} from "@/types/busca";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_app/busca")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Busca global — Gestão Cordial" },
      {
        name: "description",
        content:
          "Pesquise clientes, atendimentos, contratos, vendas e agenciamentos e veja o histórico completo de cada registro.",
      },
      { property: "og:title", content: "Busca global — Gestão Cordial" },
      {
        property: "og:description",
        content: "Busca unificada com histórico de alterações de todos os módulos do sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuscaRoute,
});

const filtros: Array<{ id: BuscaCategoriaFiltro; label: string }> = [
  { id: "todos", label: "Todos" },
  ...buscaCategoriaOrdem.map((id) => ({ id, label: buscaCategoriaLabels[id] })),
];

function BuscaRoute() {
  return (
    <RequireModuleAccess module="busca">
      <BuscaPage />
    </RequireModuleAccess>
  );
}

function BuscaPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/busca" });
  const [categoria, setCategoria] = useState<BuscaCategoriaFiltro>("todos");
  const [target, setTarget] = useState<{ categoria: BuscaCategoria; id: string } | null>(null);
  const { results, isLoading, isError, error, hasQuery, term } = useGlobalSearch(q, categoria);

  const grupos = useMemo(() => {
    return buscaCategoriaOrdem
      .map((id) => ({ id, items: results.filter((r) => r.categoria === id) }))
      .filter((group) => group.items.length > 0);
  }, [results]);

  return (
    <div className="space-y-6 pt-2">
      <SectionHeader
        eyebrow="Busca"
        title="Busca global do sistema"
        description="Encontre qualquer nome, contrato, aluguel, venda ou agenciamento e veja o histórico completo do registro."
      />

      <div className="premium-card p-4 sm:p-5">
        <div className="glass-panel flex items-center gap-3 rounded-2xl border border-white/60 px-4 py-3">
          <Search className="size-5 shrink-0 text-primary/70" />
          <input
            autoFocus
            value={q}
            onChange={(event) =>
              navigate({ search: () => ({ q: event.target.value }), replace: true })
            }
            placeholder="Digite um nome, telefone, endereço, imóvel ou corretor…"
            aria-label="Buscar em todos os módulos"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-foreground/40 focus:outline-none"
          />
          {isLoading ? <Loader2 className="size-4 animate-spin text-primary/60" /> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {filtros.map((filtro) => (
            <button
              key={filtro.id}
              type="button"
              onClick={() => setCategoria(filtro.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                categoria === filtro.id
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10",
              )}
            >
              {filtro.label}
            </button>
          ))}
        </div>
      </div>

      {!hasQuery ? (
        <EmptyHint />
      ) : isError ? (
        <p className="premium-card p-6 text-sm text-destructive">
          Não foi possível concluir a busca: {error?.message}
        </p>
      ) : grupos.length === 0 && !isLoading ? (
        <div className="premium-card flex flex-col items-center gap-2 p-10 text-center">
          <SearchX className="size-8 text-foreground/25" />
          <p className="text-sm font-semibold">Nenhum registro encontrado</p>
          <p className="text-sm text-foreground/55">
            Não encontramos nada para “{term}”. Tente outro nome, telefone ou endereço.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map((grupo) => (
            <section key={grupo.id} className="premium-card p-4 sm:p-5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold tracking-tight">
                  {buscaCategoriaLabels[grupo.id]}
                </h2>
                <span className="text-xs text-foreground/45">
                  {grupo.items.length} resultado{grupo.items.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-1.5">
                {grupo.items.map((item) => (
                  <SearchResultCard
                    key={`${item.categoria}-${item.id}`}
                    result={item}
                    onSelect={(selected) =>
                      setTarget({ categoria: selected.categoria, id: selected.id })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <RecordTimelineDrawer target={target} onOpenChange={(open) => !open && setTarget(null)} />
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="premium-card p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Search className="size-5" />
      </div>
      <p className="mt-4 text-sm font-semibold">Comece digitando ao menos 2 caracteres</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-foreground/55">
        A busca percorre atendimentos, clientes, contratos de locação, vendas, agenciamentos,
        imóveis e inquilinos — e abre o histórico completo do registro escolhido.
      </p>
    </div>
  );
}
