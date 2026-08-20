import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Info, Loader2, LockKeyhole, RefreshCw, UserCog } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { CorretorCard } from "@/components/corretores/CorretorCard";
import {
  CorretorDetailDrawer,
  type CorretorNavigationRoute,
} from "@/components/corretores/CorretorDetailDrawer";
import { CorretoresFilters } from "@/components/corretores/CorretoresFilters";
import { CorretoresRanking } from "@/components/corretores/CorretoresRanking";
import { CorretoresResponseTimeCard } from "@/components/corretores/CorretoresResponseTimeCard";
import {
  CorretoresSummaryCards,
  type CorretoresKpiTarget,
} from "@/components/corretores/CorretoresSummaryCards";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { EmptyState } from "@/components/shared/empty-state";
import { useCorretores } from "@/hooks/useCorretores";
import { useSession } from "@/lib/auth-mock";
import { hasPermission } from "@/lib/mock/permissions";
import type { Corretor, CorretorSourceKey } from "@/types/corretor";

export const Route = createFileRoute("/_app/corretores")({
  head: () => ({ meta: [{ title: "Corretores — Gestão Cordial" }] }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="corretores">
      <Page />
    </RequireModuleAccess>
  );
}

const SOURCE_LABELS: Record<CorretorSourceKey, string> = {
  atendimentos: "Atendimentos",
  agenda: "Agenda",
  agenciamentos: "Agenciamentos",
  vendas: "Vendas e comissões",
  alugueis: "Aluguéis",
  respostas: "Tempo de resposta",
  bonificacoes: "Bonificações",
};

function Page() {
  const session = useSession();
  const navigate = useNavigate();
  const [selectedCorretorId, setSelectedCorretorId] = useState<string | null>(null);
  const {
    agency,
    filters,
    setFilters,
    resetFilters,
    agencyCorretores,
    corretores,
    ranking,
    summary,
    unattributed,
    sourceStatus,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useCorretores();
  const selectedCorretor = useMemo(
    () => agencyCorretores.find((corretor) => corretor.id === selectedCorretorId) ?? null,
    [agencyCorretores, selectedCorretorId],
  );
  const unavailableSources = useMemo(
    () =>
      (Object.entries(sourceStatus) as Array<[CorretorSourceKey, "ready" | "error"]>)
        .filter(([, state]) => state === "error")
        .map(([source]) => SOURCE_LABELS[source]),
    [sourceStatus],
  );
  const notices = useMemo(() => {
    const list: string[] = [];
    if (!isError && unavailableSources.length > 0) {
      list.push(
        `Dados parciais: ${unavailableSources.join(", ")} não responderam. As métricas dependentes aparecem como indisponíveis.`,
      );
    }
    if (!isError && (unattributed.sales > 0 || unattributed.rentals > 0)) {
      const parts = [
        unattributed.sales > 0
          ? `${unattributed.sales} venda${unattributed.sales === 1 ? "" : "s"}`
          : null,
        unattributed.rentals > 0
          ? `${unattributed.rentals} ${unattributed.rentals === 1 ? "aluguel" : "aluguéis"}`
          : null,
      ].filter(Boolean);
      list.push(
        `Atribuição preservada: ${parts.join(" e ")} sem UUID de corretor ficaram fora dos indicadores individuais.`,
      );
    }
    return list;
  }, [isError, unattributed.rentals, unattributed.sales, unavailableSources]);
  const canAccess =

    session?.perfil === "admin_owner" && hasPermission(session.perfil, "corretores:read");
  const contractsReady = sourceStatus.vendas === "ready" && sourceStatus.alugueis === "ready";
  const conversionReady = sourceStatus.atendimentos === "ready";
  const rankingUnavailable =
    filters.ordenacao === "atendimentos" || filters.ordenacao === "conversao"
      ? sourceStatus.atendimentos === "error"
      : filters.ordenacao === "agenciamentos"
        ? sourceStatus.agenciamentos === "error"
        : filters.ordenacao === "bonificacoes"
          ? sourceStatus.bonificacoes === "error"
          : !contractsReady;

  const handleSelect = useCallback((corretor: Corretor) => {
    setSelectedCorretorId(corretor.id);
  }, []);

  const destinationSearch = useCallback(
    (corretorId?: string, status = "todos") => ({
      corretorId: corretorId ?? filters.corretorId,
      periodo: filters.periodo,
      imobiliaria: agency,
      status,
    }),
    [agency, filters.corretorId, filters.periodo],
  );

  const navigateToRoute = useCallback(
    (route: CorretorNavigationRoute, corretor?: Corretor) => {
      const status = route === "/vendas" ? "todos" : route === "/atendimentos" ? "todos" : "todos";
      void navigate({
        to: route,
        search: destinationSearch(corretor?.id, status),
      } as never);
    },
    [destinationSearch, navigate],
  );

  const handleKpiNavigation = useCallback(
    (target: CorretoresKpiTarget) => {
      if (target === "corretores") {
        setFilters({ status: "ativos", corretorId: "todos", busca: "" });
        document.getElementById("corretores-list")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
        return;
      }
      if (target === "agenciamentos") {
        navigateToRoute("/agenciamentos");
        return;
      }
      if (target === "contratos") {
        const contractsRoute =
          summary.alugueisFechados > summary.vendasFechadas ? "/alugueis" : "/vendas";
        void navigate({
          to: contractsRoute,
          search: destinationSearch(
            undefined,
            contractsRoute === "/alugueis" ? "todos" : "concluidas",
          ),
        } as never);
        return;
      }
      if (target === "sem-corretor") {
        void navigate({
          to: "/atendimentos",
          search: destinationSearch("nao_atribuidos", "todos"),
        } as never);
        return;
      }
      void navigate({
        to: "/atendimentos",
        search: destinationSearch(undefined, target === "conversao" ? "fechado" : "todos"),
      } as never);
    },
    [destinationSearch, navigate, navigateToRoute, setFilters, summary],
  );

  if (!canAccess) {
    return (
      <section className="premium-card mx-auto mt-8 max-w-xl p-6 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LockKeyhole className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Acesso restrito</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/65">
          A visão consolidada dos corretores está disponível apenas para administradores autorizados
          das imobiliárias.
        </p>
      </section>
    );
  }

  const agencyLabel =
    agency === "todas" ? "Todas as imobiliárias" : agency === "cordial" ? "Cordial" : "Morar";

  return (
    <>
      <div className="space-y-4 pb-3 sm:space-y-5">
        <section className="relative overflow-hidden rounded-2xl bg-[#17566b] px-4 py-3.5 text-white sm:px-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <UserCog className="size-4 shrink-0 text-white/70" aria-hidden />
              <h1 className="truncate text-lg font-black tracking-tight sm:text-xl">Corretores</h1>
              <span className="hidden truncate text-xs text-white/60 sm:inline">{agencyLabel}</span>
              {notices.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Observações sobre os dados"
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-white/75 ring-1 ring-white/15 transition-colors hover:bg-white/20"
                    >
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 rounded-2xl text-sm">
                    <ul className="space-y-2 text-foreground/75">
                      {notices.map((notice) => (
                        <li key={notice}>{notice}</li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5" aria-label="Resumo do período">
              <HeroPill
                label="Ativos"
                value={isLoading || isError ? "—" : String(summary.ativos).padStart(2, "0")}
              />
              <HeroPill
                label="Fechados"
                value={
                  isLoading || isError || !contractsReady
                    ? "—"
                    : String(summary.contratosFechados).padStart(2, "0")
                }
              />
              <HeroPill
                label="Conversão"
                value={
                  isLoading || isError || !conversionReady ? "—" : `${summary.taxaMediaConversao}%`
                }
                accent
              />
            </div>
          </div>
        </section>


        {isError && (
          <section
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/85 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <h2 className="text-sm font-semibold">Não foi possível carregar o painel</h2>
                <p className="mt-0.5 text-xs text-red-800/80">
                  Nenhum número foi substituído por dados simulados. Tente consultar novamente.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 bg-white text-red-900"
              onClick={() => void refetch()}
            >
              <RefreshCw className="mr-2 size-4" aria-hidden />
              Tentar novamente
            </Button>
          </section>
        )}

        <CorretoresSummaryCards
          summary={summary}
          sourceStatus={sourceStatus}
          isLoading={isLoading}
          isError={isError}
          onNavigate={handleKpiNavigation}
        />


        <CorretoresRanking
          ranking={ranking}
          criterion={filters.ordenacao}
          onSelect={handleSelect}
          isLoading={isLoading}
          isError={isError || rankingUnavailable}
        />

        <CorretoresResponseTimeCard
          corretores={corretores}
          sourceStatus={sourceStatus}
          isLoading={isLoading}
          isError={isError}
        />

        <section
          id="corretores-list"
          aria-label="Corretores no recorte atual"
          className="scroll-mt-24"
        >
          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight">Visão por corretor</h2>
              <p className="truncate text-xs text-foreground/55">
                {isLoading
                  ? "Carregando vínculos…"
                  : `${corretores.length} corretor${corretores.length === 1 ? "" : "es"} no recorte`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isFetching && !isLoading && (
                <Loader2
                  className="size-3.5 animate-spin text-primary motion-reduce:animate-none"
                  aria-label="Atualizando"
                />
              )}
              <CorretoresFilters
                filters={filters}
                corretores={agencyCorretores}
                onFiltersChange={setFilters}
                onReset={resetFilters}
                isLoading={isLoading}
                activeAgencyLabel={agencyLabel}
              />
            </div>
          </div>


          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="h-80 animate-pulse rounded-2xl border border-border/50 bg-card/65 motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : (
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {corretores.map((corretor) => (
                <CorretorCard
                  key={corretor.id}
                  corretor={corretor}
                  sourceStatus={sourceStatus}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </section>

        {!isLoading && !isError && corretores.length === 0 && (
          <EmptyState
            title="Nenhum corretor encontrado"
            description="Ajuste o corretor, o status ou o texto de busca. Rankings vazios não recebem posições artificiais."
          />
        )}
      </div>

      <CorretorDetailDrawer
        corretor={selectedCorretor}
        periodo={filters.periodo}
        open={selectedCorretor !== null}
        sourceStatus={sourceStatus}
        onOpenChange={(open) => {
          if (!open) setSelectedCorretorId(null);
        }}
        onNavigate={(route, corretor) => navigateToRoute(route, corretor)}
      />
    </>
  );
}

function HeroPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="min-w-0 rounded-lg px-2 py-1 ring-1 ring-white/15"
      style={{
        background: accent ? "rgba(240,168,109,0.18)" : "rgba(255,255,255,0.09)",
      }}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">
        {label}
      </p>
      <p className="mt-0.5 truncate font-mono text-sm font-black text-white">{value}</p>
    </div>

  );
}
