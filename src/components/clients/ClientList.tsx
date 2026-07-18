import { Link } from "@tanstack/react-router";
import { AlertCircle, SearchX, UsersRound } from "lucide-react";
import { ClientCard } from "./ClientCard";
import type { Client } from "@/types/client";

export function ClientList({
  clients,
  isLoading,
  error,
  onEdit,
}: {
  clients: Client[];
  isLoading?: boolean;
  error?: string | null;
  onEdit?: (client: Client) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Carregando clientes">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="glass-panel rounded-3xl p-4">
            <div className="flex items-center gap-3">
              <div className="size-12 animate-pulse rounded-2xl bg-white/65" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/70" />
                <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-white/55" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-12 animate-pulse rounded-2xl bg-white/55" />
              <div className="h-12 animate-pulse rounded-2xl bg-white/55" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel rounded-3xl p-6 text-center">
        <AlertCircle className="mx-auto size-8 text-destructive" />
        <p className="mt-3 text-sm font-semibold">Não foi possível carregar clientes.</p>
        <p className="mt-1 text-xs leading-5 text-foreground/55">{error}</p>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-teal-700/10 text-teal-800">
          <SearchX className="size-6" />
        </div>
        <p className="mt-3 text-sm font-semibold">Nenhum cliente encontrado.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-foreground/55">
          Ajuste os filtros ou crie um cadastro para começar a medir origem, perfil de busca e
          status comercial.
        </p>
        <UsersRound className="mx-auto mt-4 size-4 text-foreground/35" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clients.map((client) => (
        <Link
          key={client.id}
          to="/clientes/$clienteId"
          params={{ clienteId: client.id }}
          className="block"
        >
          <ClientCard client={client} />
        </Link>
      ))}
    </div>
  );
}
