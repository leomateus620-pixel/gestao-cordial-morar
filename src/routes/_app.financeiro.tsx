import { createFileRoute } from "@tanstack/react-router";
import { Link as LinkIcon } from "lucide-react";
import { FinancialDashboard } from "@/components/financeiro/FinancialDashboard";
import { PermissionGuard } from "@/components/permission-guard";
import { useApp, useFiltered } from "@/store/app-store";

export const Route = createFileRoute("/_app/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro | Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const lancamentos = useFiltered(useApp((state) => state.lancamentos));
  const agency = useApp((state) => state.agency);

  return (
    <>
      <FinancialDashboard lancamentos={lancamentos} agency={agency} />

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
