import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useState } from "react";
import { CalendarClock, CheckCircle2, Plus, Wallet } from "lucide-react";
import { useRentals } from "@/hooks/useRentals";
import { RentalKpiCards } from "@/components/alugueis/RentalKpiCards";
import { RentalFilters } from "@/components/alugueis/RentalFilters";
import { RentalCard } from "@/components/alugueis/RentalCard";
import { RentalExpandedDetails } from "@/components/alugueis/RentalExpandedDetails";
import { RentalFormModal } from "@/components/alugueis/RentalFormModal";
import { RentalSkeleton } from "@/components/alugueis/RentalSkeleton";
import { EmptyRentalState } from "@/components/alugueis/EmptyRentalState";
import type { RentalContractFull } from "@/types/rental";
import { useSession } from "@/lib/auth-mock";
import { canSeeFinancialInsights } from "@/lib/access-control";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_app/alugueis")({
  head: () => ({ meta: [{ title: "Aluguéis — Gestão Cordial" }] }),
  component: GuardedPage,
});

function GuardedPage() {
  return (
    <RequireModuleAccess module="alugueis">
      <Page />
    </RequireModuleAccess>
  );
}


function Page() {
  const r = useRentals();
  const session = useSession();
  const canViewFinancialInsights = canSeeFinancialInsights(session);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<RentalContractFull | null>(null);
  const [selected, setSelected] = useState<RentalContractFull | null>(null);

  const k = r.kpis;

  return (
    <>
      <header
        className={
          "relative mb-4 overflow-hidden rounded-[1.75rem] border border-white/70 " +
          "bg-white/65 px-5 py-5 backdrop-blur-xl sm:px-7 sm:py-6 " +
          "shadow-[0_28px_60px_-40px_rgba(23,60,80,0.55),inset_0_1px_0_rgba(255,255,255,0.75)] " +
          "animate-in fade-in slide-in-from-top-1 duration-500"
        }
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(23,77,97,0.28),transparent_65%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 bottom-[-40%] size-56 rounded-full bg-[radial-gradient(circle_at_center,rgba(217,120,45,0.14),transparent_70%)]"
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 items-center rounded-full border border-[#174d61]/20 bg-[#174d61]/10 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#174d61]">
                Módulo
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/50">
                Locação
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold leading-none tracking-[-0.04em] text-foreground sm:text-[2.15rem]">
              Aluguéis
            </h1>
            <p className="mt-1.5 max-w-md text-[12px] leading-snug text-foreground/62">
              Controle real de contratos, locatários e pagamentos.
            </p>

            {k && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3" strokeWidth={2.4} />
                  {k.contratosAtivos} ativos
                </span>
                {canViewFinancialInsights && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#174d61]/20 bg-[#174d61]/8 px-2.5 py-1 text-[11px] font-semibold text-[#174d61]">
                    <Wallet className="size-3" strokeWidth={2.4} />
                    {brl(k.receitaMensalAtiva, { compact: true })} / mês
                  </span>
                )}
                {k.vencendoEm30 > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    <CalendarClock className="size-3" strokeWidth={2.4} />
                    {k.vencendoEm30} vencendo em 30d
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 sm:justify-end">
            <button
              onClick={() => setOpenForm(true)}
              className={
                "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white " +
                "bg-gradient-to-br from-[#1f6a80] via-[#174d61] to-[#0f3a4a] " +
                "shadow-[0_18px_36px_-14px_rgba(23,77,97,0.65),inset_0_1px_0_rgba(255,255,255,0.25)] " +
                "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_42px_-14px_rgba(23,77,97,0.75)] active:translate-y-0 active:scale-[0.98]"
              }
            >
              <span className="grid size-5 place-items-center rounded-full bg-white/18 transition-transform duration-200 group-hover:rotate-90">
                <Plus className="size-3.5" strokeWidth={2.6} />
              </span>
              Novo aluguel
            </button>
          </div>
        </div>
      </header>

      <section className="mb-4">
        <RentalKpiCards kpis={r.kpis} canViewFinancialInsights={canViewFinancialInsights} />
      </section>

      <section className="mb-4">
        <RentalFilters
          filter={r.filter}
          onFilterChange={r.setFilter}
          search={r.search}
          onSearchChange={r.setSearch}
        />
      </section>

      <section>
        {r.isLoading ? (
          <RentalSkeleton />
        ) : r.isError ? (
          <div className="glass-panel rounded-3xl p-6 text-center text-xs text-rose-700">
            Erro ao carregar aluguéis. Tente novamente.
          </div>
        ) : r.allContracts.length === 0 ? (
          <EmptyRentalState onCreate={() => setOpenForm(true)} />
        ) : r.contracts.length === 0 ? (
          <div className="glass-panel rounded-3xl p-6 text-center text-xs text-foreground/60">
            Nenhum contrato encontrado para este filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {r.contracts.map((c) => (
              <RentalCard key={c.id} contract={c} onClick={() => setSelected(c)} />
            ))}
          </div>
        )}
      </section>

      <RentalFormModal
        open={openForm}
        onOpenChange={(o) => {
          setOpenForm(o);
          if (!o) setEditing(null);
        }}
        properties={r.properties}
        tenants={r.tenants}
        onSubmit={r.saveRental}
        isSaving={r.isSaving}
        initial={editing}
      />

      <RentalExpandedDetails
        contract={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        onEdit={(c) => {
          setSelected(null);
          setEditing(c);
          setOpenForm(true);
        }}
        onClose={async (id) => {
          await r.closeRental(id);
          setSelected(null);
        }}
        onRenew={async (id) => {
          if (!selected) return;
          const d = new Date(selected.dataFim);
          d.setFullYear(d.getFullYear() + 1);
          await r.renewRental(id, d.toISOString().slice(0, 10));
          setSelected(null);
        }}
        onMarkPaid={async (id) => {
          await r.markPaid(id);
        }}
        onDelete={async (id) => {
          if (!window.confirm("Excluir este contrato? Esta ação não pode ser desfeita."))
            return;
          await r.deleteRental(id);
          setSelected(null);
        }}
      />
    </>
  );
}
