import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  SearchX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgenciamentoCard } from "@/components/agenciamentos/AgenciamentoCard";
import { AgenciamentoDetailDrawer } from "@/components/agenciamentos/AgenciamentoDetailDrawer";
import { AgenciamentoFilters } from "@/components/agenciamentos/AgenciamentoFilters";
import { AgenciamentoFormModal } from "@/components/agenciamentos/AgenciamentoFormModal";
import { AgenciamentoSummaryCards } from "@/components/agenciamentos/AgenciamentoSummaryCards";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { Button } from "@/components/ui/button";
import { useAgenciamentos } from "@/hooks/useAgenciamentos";
import { canEditAgenciamento, getAgenciamentoPeriodLabel } from "@/services/agenciamentos";
import type { Agenciamento, AgenciamentoInput } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/agenciamentos")({
  head: () => ({ meta: [{ title: "Agenciamentos - Gestão Cordial" }] }),
  component: GuardedPage,
});

type Feedback = {
  message: string;
  tone: "success" | "error";
};

function GuardedPage() {
  return (
    <RequireModuleAccess module="agenciamentos">
      <Page />
    </RequireModuleAccess>
  );
}

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
    visibleAgenciamentos,
    summary,
    createAgenciamento,
    updateAgenciamento,
    validateAgenciamento,
    isLoading,
    isFetching,
    isError,
    error,
    refetchAgenciamentos,
  } = useAgenciamentos();
  const [selectedAgenciamento, setSelectedAgenciamento] = useState<Agenciamento | null>(null);
  const [editingAgenciamento, setEditingAgenciamento] = useState<Agenciamento | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const currentUserBroker = useMemo(
    () => ({
      id: effectiveBrokerId ?? session?.id ?? "",
      nome: currentBroker?.nome ?? session?.nome ?? "",
    }),
    [currentBroker?.nome, effectiveBrokerId, session?.id, session?.nome],
  );

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

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
    setSelectedAgenciamento(null);
    setEditingAgenciamento(agenciamento);
    setFormOpen(true);
  }, []);

  const showFeedback = useCallback((message: string, tone: Feedback["tone"] = "success") => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ message, tone });
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 4200);
  }, []);

  const handleSubmit = useCallback(
    async (input: AgenciamentoInput): Promise<boolean> => {
      if (editingAgenciamento) {
        try {
          const updated = await updateAgenciamento(editingAgenciamento.id, input);
          showFeedback(
            updated
              ? "Agenciamento atualizado com sucesso."
              : "Não foi possível editar este agenciamento.",
            updated ? "success" : "error",
          );
          if (updated) {
            setSelectedAgenciamento(null);
            setEditingAgenciamento(null);
          }
          return Boolean(updated);
        } catch (caughtError) {
          showFeedback(
            caughtError instanceof Error
              ? caughtError.message
              : "Ocorreu um erro ao atualizar o agenciamento.",
            "error",
          );
          return false;
        }
      }

      try {
        const id = await createAgenciamento(input);
        showFeedback(
          id ? "Agenciamento cadastrado com sucesso." : "Seu perfil não permite este cadastro.",
          id ? "success" : "error",
        );
        return Boolean(id);
      } catch (caughtError) {
        showFeedback(
          caughtError instanceof Error
            ? caughtError.message
            : "Ocorreu um erro ao cadastrar o agenciamento.",
          "error",
        );
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
            ? "Agenciamento validado pela gestão."
            : "Apenas administradores podem validar agenciamentos.",
          validated ? "success" : "error",
        );
        if (validated) setSelectedAgenciamento(null);
      } catch (caughtError) {
        showFeedback(
          caughtError instanceof Error
            ? caughtError.message
            : "Ocorreu um erro ao validar o agenciamento.",
          "error",
        );
      }
    },
    [showFeedback, validateAgenciamento],
  );

  if (!canRead) {
    return (
      <section className="mx-auto mt-8 max-w-xl rounded-[1.5rem] border border-white/70 bg-white/68 p-6 text-center shadow-[0_20px_60px_-42px_rgba(23,27,33,0.4)]">
        <LockKeyhole className="mx-auto size-7 text-primary" />
        <h1 className="mt-4 text-xl font-extrabold tracking-tight">Acesso restrito</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/62">
          Agenciamentos ficam disponíveis para administradores e corretores autorizados.
        </p>
      </section>
    );
  }

  const periodLabel = getAgenciamentoPeriodLabel(filters.periodo);
  const hasRecords = visibleAgenciamentos.length > 0;
  const hasFilteredResults = agenciamentos.length > 0;

  return (
    <>
      <div className="space-y-4 pb-1">
        <section className="animate-in fade-in slide-in-from-bottom-2 group/header relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/70 shadow-[0_24px_64px_-46px_rgba(23,27,33,0.48)] backdrop-blur-md duration-300 motion-reduce:animate-none">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(23,77,97,0.18),transparent_65%)] transition-transform duration-700 ease-out group-hover/header:scale-110 motion-reduce:transition-none"
          />
          <div className="relative flex flex-col gap-4 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#174d61]/10 text-[#174d61] ring-1 ring-inset ring-[#174d61]/15">
                <ClipboardCheck aria-hidden="true" className="size-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-[1.75rem]">
                  Agenciamentos
                </h1>
                <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-foreground/62">
                  Acompanhe imóveis captados, responsáveis e etapas de validação.
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={openCreate}
              disabled={!canCreate}
              title={!canCreate ? "Seu perfil não permite cadastrar agenciamentos" : undefined}
              className="group/cta h-12 w-full shrink-0 rounded-2xl bg-[#174d61] px-5 text-sm font-bold text-white shadow-[0_18px_38px_-20px_rgba(23,77,97,0.95)] transition-[background-color,box-shadow,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:bg-[#1e647d] hover:shadow-[0_22px_44px_-18px_rgba(23,77,97,0.95)] active:translate-y-0 active:scale-[0.985] motion-reduce:transition-none sm:w-auto"
            >
              <Plus className="size-4 transition-transform duration-200 ease-out group-hover/cta:rotate-90 motion-reduce:transition-none" />
              Cadastrar agenciamento
            </Button>
          </div>
        </section>

        <div aria-live="polite" aria-atomic="true">
          {feedback && (
            <div
              role={feedback.tone === "error" ? "alert" : "status"}
              className={cn(
                "animate-in fade-in slide-in-from-top-1 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold duration-200 motion-reduce:animate-none",
                feedback.tone === "success"
                  ? "border-emerald-500/18 bg-emerald-500/10 text-emerald-800"
                  : "border-red-500/18 bg-red-500/9 text-red-800",
              )}
            >
              {feedback.tone === "success" ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              {feedback.message}
            </div>
          )}
        </div>

        <div
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
          style={{ animationDelay: "40ms", animationFillMode: "both" }}
        >
          <AgenciamentoSummaryCards
            summary={summary}
            variant={isAdmin ? "admin" : "corretor"}
            periodLabel={periodLabel}
          />
        </div>

        <div
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
          style={{ animationDelay: "80ms", animationFillMode: "both" }}
        >
          <AgenciamentoFilters
            filters={filters}
            corretores={corretores}
            isAdmin={isAdmin}
            onFiltersChange={setFilters}
            onReset={resetFilters}
          />
        </div>

        <section aria-labelledby="agenciamentos-list-title" className="min-w-0">
          <div className="mb-2.5 flex items-end justify-between gap-3 px-0.5">
            <div>
              <h2 id="agenciamentos-list-title" className="text-base font-extrabold tracking-tight">
                Imóveis captados
              </h2>
              <p className="mt-0.5 text-xs text-foreground/55" aria-live="polite">
                {isLoading
                  ? "Carregando registros..."
                  : `${agenciamentos.length} ${agenciamentos.length === 1 ? "registro encontrado" : "registros encontrados"}`}
              </p>
            </div>
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/48">
                <Loader2
                  aria-hidden="true"
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                />
                Atualizando
              </span>
            )}
          </div>

          {isLoading && <AgenciamentoListSkeleton />}

          {isError && !isLoading && (
            <div className="rounded-[1.3rem] border border-red-500/18 bg-red-500/8 px-4 py-5 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-red-700" />
                <div>
                  <h3 className="text-sm font-bold text-red-900">
                    Não foi possível carregar os agenciamentos
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-red-800/72">
                    {error instanceof Error
                      ? error.message
                      : "O serviço retornou um erro inesperado."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-10 rounded-xl border-red-500/18 bg-white/65 text-red-800 shadow-none sm:mt-0"
                onClick={() => void refetchAgenciamentos()}
              >
                <RefreshCw className="size-4" />
                Tentar novamente
              </Button>
            </div>
          )}

          {!isLoading && !isError && hasFilteredResults && (
            <div className="divide-y divide-foreground/8 overflow-hidden rounded-[1.4rem] border border-white/75 bg-white/52 shadow-[0_22px_58px_-46px_rgba(23,27,33,0.42)] backdrop-blur-xl">
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
            </div>
          )}

          {!isLoading && !isError && !hasFilteredResults && (
            <OperationalEmptyState
              hasRecords={hasRecords}
              canCreate={canCreate}
              onCreate={openCreate}
              onReset={resetFilters}
            />
          )}
        </section>
      </div>

      <AgenciamentoFormModal
        open={formOpen}
        agenciamento={editingAgenciamento}
        corretores={corretores}
        currentBroker={currentBroker}
        currentUserBroker={currentUserBroker}
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

function HeaderStat({
  label,
  value,
  bordered,
}: {
  label: string;
  value: number | string;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn("min-w-0 px-2 text-center sm:px-4", bordered && "border-x border-foreground/9")}
    >
      <p className="truncate text-[10px] font-semibold text-foreground/50 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-0.5 text-base font-extrabold text-foreground tabular-nums sm:text-lg">
        {value}
      </p>
    </div>
  );
}

function OperationalEmptyState({
  hasRecords,
  canCreate,
  onCreate,
  onReset,
}: {
  hasRecords: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-[1.4rem] border border-dashed border-foreground/14 bg-white/46 px-5 py-7 text-center sm:py-8">
      <SearchX aria-hidden="true" className="mx-auto size-7 text-primary/72" />
      <h3 className="mt-3 text-base font-extrabold tracking-tight">
        {hasRecords ? "Nenhum resultado encontrado" : "Nenhum agenciamento cadastrado"}
      </h3>
      <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-foreground/58">
        {hasRecords
          ? "Ajuste ou limpe os filtros para voltar a visualizar os imóveis captados."
          : "Cadastre o primeiro imóvel captado para acompanhar o checklist e a validação."}
      </p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        {hasRecords ? (
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-foreground/10 bg-white/70 shadow-none"
            onClick={onReset}
          >
            <RefreshCw className="size-4" />
            Limpar filtros
          </Button>
        ) : (
          canCreate && (
            <Button
              type="button"
              className="h-10 rounded-xl bg-[#174d61] text-white transition-[background-color,transform] duration-150 ease-out hover:bg-[#1e647d] active:scale-[0.985]"
              onClick={onCreate}
            >
              <Plus className="size-4" />
              Cadastrar primeiro agenciamento
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function AgenciamentoListSkeleton() {
  return (
    <div
      className="divide-y divide-foreground/7 overflow-hidden rounded-[1.4rem] border border-white/75 bg-white/52"
      aria-label="Carregando agenciamentos"
    >
      {[0, 1, 2].map((item) => (
        <div key={item} className="grid gap-4 px-5 py-5 md:grid-cols-[1.4fr_0.7fr_0.8fr]">
          <div>
            <div className="h-4 w-28 animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none" />
            <div className="mt-3 h-5 w-4/5 animate-pulse rounded-md bg-foreground/8 motion-reduce:animate-none" />
            <div className="mt-2 h-3 w-3/5 animate-pulse rounded-md bg-foreground/6 motion-reduce:animate-none" />
          </div>
          <div className="h-12 animate-pulse rounded-xl bg-foreground/6 motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-xl bg-foreground/6 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
