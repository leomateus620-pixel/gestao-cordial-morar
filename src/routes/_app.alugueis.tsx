import { createFileRoute } from "@tanstack/react-router";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useRentals } from "@/hooks/useRentals";
import { RentalKpiCards } from "@/components/alugueis/RentalKpiCards";
import { RentalFilters } from "@/components/alugueis/RentalFilters";
import { RentalCard } from "@/components/alugueis/RentalCard";
import { RentalExpandedDetails } from "@/components/alugueis/RentalExpandedDetails";
import { RentalFormModal } from "@/components/alugueis/RentalFormModal";
import { RentalSkeleton } from "@/components/alugueis/RentalSkeleton";
import { EmptyRentalState } from "@/components/alugueis/EmptyRentalState";
import type { RentalContractFull } from "@/types/rental";

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
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<RentalContractFull | null>(null);
  const [selected, setSelected] = useState<RentalContractFull | null>(null);

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Aluguéis</h1>
          <p className="text-[11px] text-foreground/60">
            Controle real de contratos, locatários e pagamentos.
          </p>
        </div>
        <button
          onClick={() => setOpenForm(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.99]"
        >
          <Plus className="size-3.5" /> Novo aluguel
        </button>
      </header>

      <section className="mb-4">
        <RentalKpiCards kpis={r.kpis} />
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
        onOpenChange={setOpenForm}
        properties={r.properties}
        tenants={r.tenants}
        onSubmit={r.createRental}
        isSaving={r.isSaving}
      />

      <RentalExpandedDetails
        contract={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
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
