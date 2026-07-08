import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useMemo } from "react";
import { Link as LinkIcon } from "lucide-react";
import { FinancialDashboard } from "@/components/financeiro/FinancialDashboard";
import { PermissionGuard } from "@/components/permission-guard";
import { useFinanceiro } from "@/hooks/useFinanceiro";
import { useApp } from "@/store/app-store";

export const Route = createFileRoute("/_app/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro | Gestão Cordial" }] }),
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
  const { lancamentos, isLoading, isError } = useFinanceiro();

  const filtered = useMemo(() => {
    if (agency === "todas") return lancamentos;
    return lancamentos.filter((l) => l.imobiliaria === agency);
  }, [lancamentos, agency]);

  return (
    <>
      {isLoading ? (
        <div className="glass-panel rounded-3xl p-8 text-sm text-foreground/60">
          Carregando lançamentos financeiros...
        </div>
      ) : isError ? (
        <div className="glass-panel rounded-3xl p-8 text-sm text-red-600">
          Não foi possível carregar os lançamentos financeiros.
        </div>
      ) : (
        <FinancialDashboard lancamentos={filtered} agency={agency} />
      )}

      <PermissionGuard modules={["integracoes", "financeiro"]}>
        <section className="glass-panel mt-6 rounded-3xl p-5">
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
    </>
  );
}
