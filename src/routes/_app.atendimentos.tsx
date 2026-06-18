import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Inbox, Workflow } from "lucide-react";
import { AtendimentoCard } from "@/components/atendimentos/AtendimentoCard";
import { AtendimentoCreateCard } from "@/components/atendimentos/AtendimentoCreateCard";
import { AtendimentoFilters } from "@/components/atendimentos/AtendimentoFilters";
import { AtendimentoFormModal } from "@/components/atendimentos/AtendimentoFormModal";
import { AtendimentoSummaryCards } from "@/components/atendimentos/AtendimentoSummaryCards";
import { EmptyState } from "@/components/shared/empty-state";
import {
  defaultAtendimentoFilters,
  useAtendimentos,
  type AtendimentoFilters as AtendimentoFiltersState,
} from "@/hooks/useAtendimentos";
import type { AtendimentoCreateInput, AtendimentoStatus } from "@/types/atendimento";

export const Route = createFileRoute("/_app/atendimentos")({
  head: () => ({ meta: [{ title: "Atendimentos — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AtendimentoFiltersState>(defaultAtendimentoFilters);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { filteredAtendimentos, stats, addAtendimento, convertAtendimentoToCliente } =
    useAtendimentos(query, filters);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function createAtendimento(input: AtendimentoCreateInput) {
    addAtendimento(input);
    window.setTimeout(
      () => setFeedback(`Atendimento de ${input.clienteNome} salvo.`),
      220,
    );
  }

  function convertAtendimento(id: string) {
    const clientId = convertAtendimentoToCliente(id);
    setFeedback(
      clientId
        ? "Atendimento transformado em cliente com sucesso."
        : "Não foi possível transformar este atendimento.",
    );
  }

  function setStatus(status: "todos" | AtendimentoStatus) {
    setFilters((current) => ({ ...current, status }));
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#174d61_0%,#1e647d_48%,#28333b_100%)] p-5 text-white shadow-[0_24px_60px_-24px_rgba(23,27,33,0.55)] sm:p-6">
        <span className="absolute -right-10 -top-16 size-44 rounded-full bg-cyan-200/10 blur-3xl" />
        <div className="relative flex items-start gap-3 sm:items-center">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cyan-200/13 ring-1 ring-white/10">
            <Inbox className="size-6 text-orange-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-300">
              Central de entrada comercial
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
              Atendimentos
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/64">
              Do primeiro contato ao encaminhamento, com dados prontos para revelar o nicho real da
              imobiliária.
            </p>
          </div>
          <span className="hidden items-center gap-2 rounded-full bg-white/8 px-3 py-2 text-[10px] font-semibold text-white/68 ring-1 ring-white/10 md:flex">
            <Workflow className="size-3.5 text-orange-300" />
            Pré-atendimento · Corretor · Conversão
          </span>
        </div>
      </section>

      <AtendimentoFilters
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <AtendimentoCreateCard onClick={() => setOpen(true)} isOpen={open} />

      <AtendimentoSummaryCards
        stats={stats}
        activeStatus={filters.status}
        onStatusChange={setStatus}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Fila de atendimentos</h2>
            <p className="text-[11px] text-foreground/50">
              {filteredAtendimentos.length} atendimento
              {filteredAtendimentos.length === 1 ? "" : "s"} no recorte atual
            </p>
          </div>
          <span className="rounded-full bg-white/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-800">
            Operação comercial
          </span>
        </div>

        {filteredAtendimentos.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredAtendimentos.map((atendimento) => (
              <AtendimentoCard
                key={atendimento.id}
                atendimento={atendimento}
                onConvert={convertAtendimento}
                onMockAction={(action, contactName) =>
                  setFeedback(`${action} para ${contactName}: fluxo preparado no modo local.`)
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhum atendimento encontrado"
            description="Ajuste a busca ou os filtros. Você também pode registrar uma nova entrada comercial acima."
            icon={<Inbox className="size-5" />}
          />
        )}
      </section>

      {feedback && (
        <div className="fixed left-1/2 top-5 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm font-semibold text-teal-900 shadow-xl shadow-stone-950/12 backdrop-blur-xl">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
          {feedback}
        </div>
      )}

      <AtendimentoFormModal open={open} onOpenChange={setOpen} onSubmit={createAtendimento} />
    </div>
  );
}
