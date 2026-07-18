import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
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
import { useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import type { Client, ClientCreateInput } from "@/types/client";

export const Route = createFileRoute("/_app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ClientFiltersState>(defaultClientFilters);
  const setAgency = useApp((state) => state.setAgency);
  const {
    agency,
    clients,
    filteredClients,
    stats,
    addClient,
    updateClient,
    isLoading,
    isError,
    error,
  } = useClients(query, filters);

  const canEditClient = useCallback(
    (client: Client) => {
      if (!session) return false;
      if (session.perfil === "admin_owner" || session.perfil === "financeiro_admin") return true;
      return client.createdBy === session.id;
    },
    [session],
  );

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

  async function saveEdit(input: ClientCreateInput) {
    if (!editing) return;
    try {
      await updateClient({ id: editing.id, patch: input });
      toast.success(`Cadastro de ${input.fullName} atualizado.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível atualizar o cliente.";
      toast.error(message);
      throw err;
    }
  }

  const handleEditRequest = useCallback(
    (client: Client) => {
      if (!canEditClient(client)) {
        toast.error("Você só pode editar cadastros que você criou.");
        return;
      }
      setEditing(client);
    },
    [canEditClient],
  );

  const hasAnyClient = clients.length > 0;
  const hasFiltersOrSearch =
    query.trim().length > 0 ||
    Object.entries(filters).some(([, value]) => value !== "todos");

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

        {!isLoading && !isError && !hasAnyClient ? (
          <EmptyState onCreate={() => setOpen(true)} />
        ) : !isLoading && !isError && hasAnyClient && filteredClients.length === 0 ? (
          <NoMatchState filtered={hasFiltersOrSearch} />
        ) : (
          <ClientList
            clients={filteredClients}
            isLoading={isLoading}
            error={isError ? (error?.message ?? "Erro ao carregar clientes.") : null}
            onEdit={handleEditRequest}
          />
        )}
      </section>

      {open && <ClientFormModal open={open} onOpenChange={setOpen} onSubmit={createClient} />}
      {editing && (
        <ClientFormModal
          open={Boolean(editing)}
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          onSubmit={saveEdit}
          initialClient={editing}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glass-panel rounded-3xl p-8 text-center">
      <p className="text-base font-semibold text-foreground">
        Nenhum cliente cadastrado ainda.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-foreground/55">
        Clique em <span className="font-semibold text-foreground/80">Criar cadastro</span> para
        registrar o primeiro cliente e alimentar seus relatórios comerciais.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center justify-center rounded-full bg-teal-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800"
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
        {filtered ? "Nenhum cliente encontrado com os filtros atuais." : "Nenhum cliente nesta visão."}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-foreground/55">
        Ajuste os filtros ou limpe a busca para ver mais resultados.
      </p>
    </div>
  );
}
