import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ClientCreateCard } from "@/components/clients/ClientCreateCard";
import { ClientFilters } from "@/components/clients/ClientFilters";
import { ClientFormModal } from "@/components/clients/ClientFormModal";
import { ClientList } from "@/components/clients/ClientList";
import { ClientSummaryCards } from "@/components/clients/ClientSummaryCards";
import {
  defaultClientFilters,
  useClients,
  type ClientFilters as ClientFiltersState,
} from "@/hooks/useClients";
import { useApp } from "@/store/app-store";
import type { ClientCreateInput } from "@/types/client";

export const Route = createFileRoute("/_app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ClientFiltersState>(defaultClientFilters);
  const [success, setSuccess] = useState<string | null>(null);
  const setAgency = useApp((state) => state.setAgency);
  const { agency, filteredClients, stats, addClient } = useClients(query, filters);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 2600);
    return () => window.clearTimeout(timer);
  }, [success]);

  function createClient(client: ClientCreateInput) {
    addClient(client);
    setSuccess(client.fullName);
  }

  return (
    <div className="space-y-4">
      <ClientFilters
        query={query}
        onQueryChange={setQuery}
        agency={agency}
        onAgencyChange={setAgency}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <ClientCreateCard onClick={() => setOpen(true)} isOpen={open} />

      <ClientSummaryCards stats={stats} />

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Clientes</h2>
            <p className="text-[11px] text-foreground/50">
              {filteredClients.length} cadastro{filteredClients.length === 1 ? "" : "s"} no recorte
              atual
            </p>
          </div>
          <span className="rounded-full bg-white/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
            Comercial
          </span>
        </div>
        <ClientList clients={filteredClients} isLoading={false} error={null} />
      </section>

      {success && (
        <div className="fixed left-1/2 top-5 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 bg-white/88 px-4 py-3 text-sm font-semibold text-teal-900 shadow-xl shadow-stone-950/12 backdrop-blur-xl">
          <CheckCircle2 className="size-4 text-emerald-700" />
          Cadastro de {success} salvo.
        </div>
      )}

      {open && <ClientFormModal open={open} onOpenChange={setOpen} onSubmit={createClient} />}
    </div>
  );
}
