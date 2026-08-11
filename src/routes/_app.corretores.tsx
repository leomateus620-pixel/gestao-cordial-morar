import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Loader2, LockKeyhole, RefreshCw, UserCog } from "lucide-react";
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
  const canAccess =
    session?.perfil === "admin_owner" && hasPermission(session.perfil, "corretores:read");
  const contractsReady = sourceStatus.vendas === "ready" && sourceStatus.alugueis === "ready";
  const conversionReady = sourceStatus.atendimentos === "ready";
  const rankingUnavailable =
    filters.ordenacao === "atendimentos" || filters.ordenacao === "conversao"
      ? sourceStatus.atendimentos === "error"
      : filters.ordenacao === "agenciamentos"
        ? sourceStatus.agenciamentos === "error"
        : filters.ordenacao === "comissao"
          ? sourceStatus.vendas === "error"
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
      if (target === "comissoes") {
        void navigate({
          to: "/vendas",
          search: destinationSearch(undefined, "todos"),
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
        <section className="relative overflow-hidden rounded-[1.6rem] bg-[#17566b] p-5 text-white shadow-[0_18px_46px_-30px_rgba(18,50,61,0.72)] sm:p-6">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 ring-1 ring-white/15">
                <UserCog className="size-3.5" aria-hidden />
                Inteligência operacional
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Corretores</h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/75">
                Indicadores rastreáveis de atendimentos, agenda, agenciamentos, negócios e resposta
                da equipe.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:w-fit" aria-label="Resumo do período">
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Visão por corretor</h2>
              <p className="text-xs text-foreground/58">
                {isLoading
                  ? "Carregando vínculos operacionais…"
                  : `${corretores.length} corretor${corretores.length === 1 ? "" : "es"} no recorte`}
              </p>
            </div>
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                Atualizando
              </span>
            )}
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
      className="min-w-0 rounded-xl px-3 py-2 ring-1 ring-white/15"
      style={{
        background: accent ? "rgba(240,168,109,0.18)" : "rgba(255,255,255,0.09)",
      }}
    >
      <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-base font-black text-white">{value}</p>
    </div>
  );
}
