import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, LockKeyhole, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AgenciamentoCard } from "@/components/agenciamentos/AgenciamentoCard";
import { AgenciamentoDetailDrawer } from "@/components/agenciamentos/AgenciamentoDetailDrawer";
import { AgenciamentoFilters } from "@/components/agenciamentos/AgenciamentoFilters";
import { AgenciamentoFormModal } from "@/components/agenciamentos/AgenciamentoFormModal";
import { AgenciamentoSummaryCards } from "@/components/agenciamentos/AgenciamentoSummaryCards";
import { EmptyState } from "@/components/shared/empty-state";
import { useAgenciamentos } from "@/hooks/useAgenciamentos";
import { canEditAgenciamento } from "@/services/agenciamentos";
import type { Agenciamento, AgenciamentoInput } from "@/types/agenciamento";

export const Route = createFileRoute("/_app/agenciamentos")({
  head: () => ({ meta: [{ title: "Agenciamentos - Gestao Cordial" }] }),
  component: Page,
});

function Page() {
  const {
    session,
    canRead,
    canCreate,
    canManage,
    isAdmin,
    currentBroker,
    effectiveBrokerId,
    corretores,
    filters,
    setFilters,
    resetFilters,
    agenciamentos,
    summary,
    createAgenciamento,
    updateAgenciamento,
    validateAgenciamento,
    isLoading,
    isError,
    error,
  } = useAgenciamentos();
  const [selectedAgenciamento, setSelectedAgenciamento] = useState<Agenciamento | null>(null);
  const [editingAgenciamento, setEditingAgenciamento] = useState<Agenciamento | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const pageCopy = isAdmin
    ? {
        eyebrow: "Controle de agenciamentos",
        title: "Agenciamentos",
        subtitle: "Acompanhe imóveis captados pela equipe e valide fotos, placas, site e Drive.",
      }
    : {
        eyebrow: "Minha evolução",
        title: "Agenciamentos",
        subtitle:
          "Acompanhe seus imóveis agenciados, pendências de fotos, placas, Drive e validação.",
      };

  const selectedCanEdit = useMemo(
    () =>
      selectedAgenciamento
        ? canEditAgenciamento(selectedAgenciamento, session, effectiveBrokerId)
        : false,
    [effectiveBrokerId, selectedAgenciamento, session],
  );

  const canEditItem = useCallback(
    (item: Agenciamento) => canEditAgenciamento(item, session, effectiveBrokerId),
    [effectiveBrokerId, session],
  );

  const openCreate = useCallback(() => {
    setEditingAgenciamento(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((agenciamento: Agenciamento) => {
    setEditingAgenciamento(agenciamento);
    setFormOpen(true);
  }, []);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), 3200);
  }, []);

  const handleSubmit = useCallback(
    async (input: AgenciamentoInput): Promise<boolean> => {
      if (editingAgenciamento) {
        try {
          const updated = await updateAgenciamento(editingAgenciamento.id, input);
          showFeedback(
            updated
              ? "Agenciamento atualizado com sucesso."
              : "Nao foi possivel editar este agenciamento.",
          );
          if (updated) {
            setSelectedAgenciamento(null);
            setEditingAgenciamento(null);
          }
          return Boolean(updated);
        } catch (error) {
<<<<<<< HEAD
          showFeedback(error instanceof Error ? error.message : "Erro ao atualizar agenciamento.");
=======
          showFeedback(
            error instanceof Error ? error.message : "Erro ao atualizar agenciamento.",
          );
          return false;
>>>>>>> 3a78f737f34d2dea925811992090b905b3dd0d97
        }
      }

      try {
        const id = await createAgenciamento(input);
        showFeedback(id ? "Agenciamento cadastrado com sucesso." : "Cadastro nao permitido.");
        return Boolean(id);
      } catch (error) {
        showFeedback(error instanceof Error ? error.message : "Erro ao cadastrar agenciamento.");
        return false;
      }
    },
    [createAgenciamento, editingAgenciamento, showFeedback, updateAgenciamento],
  );

  const handleValidate = useCallback(
    async (agenciamento: Agenciamento) => {
      try {
        const validated = await validateAgenciamento(agenciamento.id);
        showFeedback(
          validated
            ? "Agenciamento validado pela gestao."
            : "Apenas administradores podem validar.",
        );
        if (validated) setSelectedAgenciamento(null);
      } catch (error) {
        showFeedback(error instanceof Error ? error.message : "Erro ao validar agenciamento.");
      }
    },
    [showFeedback, validateAgenciamento],
  );

  if (!canRead) {
    return (
      <section className="premium-card mx-auto mt-8 max-w-xl p-6 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LockKeyhole className="size-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Acesso restrito</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/58">
          Agenciamentos ficam disponíveis para administradores e corretores autorizados.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <section
          className="relative overflow-hidden rounded-[1.85rem] p-5 text-white shadow-[0_24px_70px_-30px_rgba(23,27,33,0.5)] sm:p-6 lg:p-7"
          style={{
            background: "linear-gradient(135deg, #174d61 0%, #1e647d 48%, #25323a 100%)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-cyan-200/12 blur-3xl"
          />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-50/78 ring-1 ring-white/12">
                <ClipboardCheck className="size-3.5" />
                {pageCopy.eyebrow}
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{pageCopy.title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/68">
                {pageCopy.subtitle}
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="grid grid-cols-3 gap-2 sm:w-fit">
                <HeroPill label="No mês" value={String(summary.mes).padStart(2, "0")} />
                <HeroPill
                  label="Pendentes"
                  value={String(summary.pendentesValidacao).padStart(2, "0")}
                />
                <HeroPill label="Checklist" value={`${summary.percentualChecklistMedio}%`} accent />
              </div>
              <button
                type="button"
                onClick={openCreate}
                disabled={!canCreate}
                style={{ touchAction: "manipulation" }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-[#174d61] shadow-[0_14px_30px_-18px_rgba(0,0,0,0.55)] ring-1 ring-white/40 transition-all hover:bg-cyan-50 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:cursor-not-allowed disabled:opacity-55 lg:w-auto"
              >
                <Plus className="size-4" />
                Cadastrar agenciamento
              </button>
            </div>
          </div>
        </section>

        {feedback && (
          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700">
            {feedback}
          </div>
        )}

        <AgenciamentoSummaryCards summary={summary} variant={isAdmin ? "admin" : "corretor"} />

        <AgenciamentoFilters
          filters={filters}
          corretores={corretores}
          isAdmin={isAdmin}
          onFiltersChange={setFilters}
          onReset={resetFilters}
        />

        <section className="grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {agenciamentos.map((agenciamento) => (
            <AgenciamentoCard
              key={agenciamento.id}
              agenciamento={agenciamento}
              canManage={canManage}
              canEdit={canEditItem(agenciamento)}
              onView={setSelectedAgenciamento}
              onEdit={openEdit}
              onValidate={handleValidate}
            />
          ))}
        </section>

        {isLoading && (
          <div className="rounded-2xl border border-border/40 bg-card/50 px-4 py-6 text-center text-sm text-foreground/60">
            Carregando agenciamentos...
          </div>
        )}

        {isError && !isLoading && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            Falha ao carregar agenciamentos:{" "}
            {error instanceof Error ? error.message : "erro desconhecido"}.
          </div>
        )}

        {!isLoading && !isError && agenciamentos.length === 0 && (
          <EmptyState
            title="Nenhum agenciamento cadastrado ainda."
            description={
              isAdmin
                ? "Quando a equipe cadastrar imóveis captados, eles aparecerão aqui. Use os filtros para revisar registros existentes."
                : "Clique em Cadastrar agenciamento para registrar o primeiro imóvel captado."
            }
          />
        )}
      </div>

      <AgenciamentoFormModal
        open={formOpen}
        agenciamento={editingAgenciamento}
        corretores={corretores}
        currentBroker={currentBroker}
        canManage={canManage}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingAgenciamento(null);
        }}
        onSubmit={handleSubmit}
      />

      <AgenciamentoDetailDrawer
        agenciamento={selectedAgenciamento}
        open={selectedAgenciamento !== null}
        canManage={canManage}
        canEdit={selectedCanEdit}
        onOpenChange={(open) => {
          if (!open) setSelectedAgenciamento(null);
        }}
        onEdit={openEdit}
        onValidate={handleValidate}
      />
    </>
  );
}

function HeroPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="min-w-0 rounded-2xl px-3 py-2.5 ring-1 ring-white/14"
      style={{
        background: accent ? "rgba(240,168,109,0.18)" : "rgba(255,255,255,0.09)",
      }}
    >
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/50">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-base font-black text-white sm:text-lg">{value}</p>
    </div>
  );
}
