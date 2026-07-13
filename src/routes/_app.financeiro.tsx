import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useMemo } from "react";
import { Link as LinkIcon } from "lucide-react";
import { FinancialDashboard } from "@/components/financeiro/FinancialDashboard";
import { isFinanceSection, type FinanceSection } from "@/components/financeiro/finance-sections";
import { PermissionGuard } from "@/components/permission-guard";
import { useFinanceiro } from "@/hooks/useFinanceiro";
import { useApp } from "@/store/app-store";

export const Route = createFileRoute("/_app/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro | Gestão Cordial" }] }),
  validateSearch: (search: Record<string, unknown>): { financeView: FinanceSection } => ({
    financeView: isFinanceSection(search.financeView) ? search.financeView : "visao-geral",
  }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="financeiro">
      <Page />
    </RequireModuleAccess>
  );
}

function Page() {
  const agency = useApp((state) => state.agency);
  const { financeView } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { lancamentos, isLoading, isFetching, isError, refetch } = useFinanceiro();

  const filtered = useMemo(() => {
    if (agency === "todas") return lancamentos;
    return lancamentos.filter((l) => l.imobiliaria === agency || l.imobiliaria === "ambas");
  }, [lancamentos, agency]);

  return (
    <FinancialDashboard
      lancamentos={filtered}
      agency={agency}
      activeSection={financeView}
      onSectionChange={(nextSection) => {
        void navigate({
          search: (previous: { financeView: FinanceSection }) => ({
            ...previous,
            financeView: nextSection,
          }),
        });
      }}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => void refetch()}
      overviewFooter={
        <PermissionGuard modules={["integracoes", "financeiro"]}>
          <section className="glass-panel rounded-3xl p-5">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-700">
                <LinkIcon className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Integração Conta Azul</h3>
                <p className="mt-1 text-[11px] text-foreground/60">
                  Em breve: sincronize lançamentos, repasses e comissões automaticamente com o Conta
                  Azul.
                </p>
                <span className="mt-2 inline-block rounded-full bg-foreground/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground/55">
                  Disponível em breve
                </span>
              </div>
            </div>
          </section>
        </PermissionGuard>
      }
    />
  );
}
