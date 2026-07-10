import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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
  const setAgency = useApp((state) => state.setAgency);
  const { agency, clients, filteredClients, stats, addClient, isLoading, isError, error, refetch } =
    useClients(query, filters);

  async function createClient(client: ClientCreateInput) {
    try {
      await addClient(client);
      toast.success(`Cadastro de ${client.fullName} salvo.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível salvar o cliente.";
      toast.error(message);
      throw err;
    }
  }

  const hasAnyClient = clients.length > 0;
  const hasFiltersOrSearch =
    query.trim().length > 0 || Object.entries(filters).some(([, value]) => value !== "todos");

  return (
    <div className="space-y-4">
      <ClientCreateCard onClick={() => setOpen(true)} isOpen={open} />

      <ClientFilters
        query={query}
        onQueryChange={setQuery}
        agency={agency}
        onAgencyChange={setAgency}
        filters={filters}
        onFiltersChange={setFilters}
        resultCount={filteredClients.length}
      />

      <ClientSummaryCards stats={stats} />

      <section className="space-y-3" aria-labelledby="client-list-title">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 id="client-list-title" className="text-sm font-semibold tracking-tight">
              Carteira de clientes
            </h2>
            <p className="text-[11px] text-foreground/50">
              {filteredClients.length} cadastro{filteredClients.length === 1 ? "" : "s"} no recorte
              atual
            </p>
          </div>
          <span className="rounded-full border border-white/60 bg-white/48 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-teal-800">
            CRM comercial
          </span>
        </div>

        {!isLoading && !isError && !hasAnyClient ? (
          <EmptyState onCreate={() => setOpen(true)} />
        ) : !isLoading && !isError && hasAnyClient && filteredClients.length === 0 ? (
          <NoMatchState filtered={hasFiltersOrSearch} />
        ) : (
          <ClientList
            clients={filteredClients}
            isLoading={isLoading}
            error={isError ? (error?.message ?? "Erro ao carregar clientes.") : null}
            onRetry={() => void refetch()}
          />
        )}
      </section>

      {open && <ClientFormModal open={open} onOpenChange={setOpen} onSubmit={createClient} />}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glass-panel rounded-3xl p-8 text-center" aria-live="polite">
      <p className="text-base font-semibold text-foreground">Nenhum cliente cadastrado ainda.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/55">
        Clique em <span className="font-semibold text-foreground/80">Criar cadastro</span> para
        registrar o primeiro cliente e alimentar seus relatórios comerciais.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="premium-pressable mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-teal-900 px-5 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 hover:bg-teal-800"
      >
        Criar cadastro
      </button>
    </div>
  );
}

function NoMatchState({ filtered }: { filtered: boolean }) {
  return (
    <div className="glass-panel rounded-3xl p-6 text-center">
      <p className="text-sm font-semibold">
        {filtered
          ? "Nenhum cliente encontrado com os filtros atuais."
          : "Nenhum cliente nesta visão."}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-foreground/55">
        Ajuste os filtros ou limpe a busca para ver mais resultados.
      </p>
    </div>
  );
}
