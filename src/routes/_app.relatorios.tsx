import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useMemo } from "react";
import { ReportsPage } from "@/components/reports/ReportsPage";
import { defaultAtendimentoFilters, useAttendances } from "@/hooks/useAttendances";
import { useAgenciamentos } from "@/hooks/useAgenciamentos";
import { defaultClientFilters, useClients } from "@/hooks/useClients";
import { useFinanceiro } from "@/hooks/useFinanceiro";
import { useMarketing } from "@/hooks/useMarketing";
import { useRentals } from "@/hooks/useRentals";
import { useSales } from "@/hooks/useSales";
import { useApp, useFiltered } from "@/store/app-store";
import type { ReportsAreaId, ReportsSourceState } from "@/types/reports";

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios | Gestão Cordial" }] }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="relatorios">
      <Page />
    </RequireModuleAccess>
  );
}


function Page() {
  const agency = useApp((state) => state.agency);
  const corretores = useFiltered(useApp((state) => state.corretores));

  const agenciamentos = useAgenciamentos({ skipDashboard: true });
  const atendimentos = useAttendances("", defaultAtendimentoFilters);
  const clients = useClients("", defaultClientFilters);
  const rentals = useRentals();
  const sales = useSales();
  const financeiro = useFinanceiro();
  const marketing = useMarketing();

  const lancamentos = financeiro.lancamentos;
  const campaigns = marketing.campaigns;

  const sourceStates = useMemo<Partial<Record<ReportsAreaId, ReportsSourceState>>>(
    () => ({
      agenciamentos: agenciamentos.canRead
        ? getQuerySourceState(
            agenciamentos.isLoading,
            agenciamentos.isError,
            "Não foi possível carregar agenciamentos.",
            agenciamentos.error,
          )
        : {
            status: "unavailable",
            title: "Dados de agenciamentos indisponíveis para este perfil.",
            description:
              "A origem existe, mas o usuário atual não possui permissão para consolidar esta área.",
          },
      atendimentos: getQuerySourceState(
        atendimentos.isLoading,
        atendimentos.isError,
        "Não foi possível carregar atendimentos.",
        atendimentos.error,
      ),
      clientes: getQuerySourceState(
        clients.isLoading,
        clients.isError,
        "Não foi possível carregar clientes.",
        clients.error,
      ),
      alugueis: getQuerySourceState(
        rentals.isLoading,
        rentals.isError,
        "Não foi possível carregar aluguéis.",
        rentals.error,
      ),
      vendas: getQuerySourceState(
        sales.isLoading,
        sales.isError,
        "Não foi possível carregar vendas.",
        sales.error,
      ),
      financeiro: getQuerySourceState(
        financeiro.isLoading,
        financeiro.isError,
        "Não foi possível carregar lançamentos financeiros.",
        financeiro.error,
      ),
      marketing: getQuerySourceState(
        marketing.isLoading,
        marketing.isError,
        "Não foi possível carregar campanhas de marketing.",
        marketing.error,
      ),
    }),
    [
      agenciamentos.canRead,
      agenciamentos.error,
      agenciamentos.isError,
      agenciamentos.isLoading,
      atendimentos.error,
      atendimentos.isError,
      atendimentos.isLoading,
      clients.error,
      clients.isError,
      clients.isLoading,
      rentals.error,
      rentals.isError,
      rentals.isLoading,
      sales.error,
      sales.isError,
      sales.isLoading,
      financeiro.error,
      financeiro.isError,
      financeiro.isLoading,
      marketing.error,
      marketing.isError,
      marketing.isLoading,
    ],
  );

  return (
    <ReportsPage
      agency={agency}
      agenciamentos={agenciamentos.visibleAgenciamentos}
      atendimentos={atendimentos.atendimentos}
      clients={clients.clients}
      rentals={rentals.allContracts}
      sales={sales.sales}
      lancamentos={lancamentos}
      campaigns={campaigns}
      corretores={corretores}
      sourceStates={sourceStates}
    />
  );
}

function getQuerySourceState(
  isLoading: boolean,
  isError: boolean,
  fallbackTitle: string,
  error: unknown,
): ReportsSourceState {
  if (isLoading) {
    return {
      status: "loading",
      title: "Carregando dados da área.",
      description: "Aguarde enquanto a origem é consultada.",
    };
  }

  if (isError) {
    return {
      status: "error",
      title: fallbackTitle,
      description: error instanceof Error ? error.message : "Tente novamente em instantes.",
    };
  }

  return { status: "ready" };
}
