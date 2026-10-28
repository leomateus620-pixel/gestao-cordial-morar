import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, LayoutGrid, Loader2, Search, X } from "lucide-react";
import {
  AtendimentoCompactCard,
  type AtendimentoCardDensity,
} from "@/components/atendimentos/AtendimentoCompactCard";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  selectStageAttendances,
  type StageAttendanceSort,
} from "@/lib/atendimentos/stage-workspace";
import { cn } from "@/lib/utils";
import { pipelineStageLabel, type Atendimento, type PipelineStage } from "@/types/atendimento";

type Props = {
  stage: PipelineStage;
  atendimentos: Atendimento[];
  context: string;
  onBack: () => void;
  backLabel?: string;
  onOpen: (atendimento: Atendimento) => void;
  onStageChange: (id: string, stage: PipelineStage) => Promise<void> | void;
  density: AtendimentoCardDensity;
  onDensityChange: (density: AtendimentoCardDensity) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  globalEmptyState?: "crm-empty" | "filtered-empty";
};

export function AtendimentoStageExpandedView({
  stage,
  atendimentos,
  context,
  onBack,
  backLabel = "Voltar ao funil",
  onOpen,
  onStageChange,
  density,
  onDensityChange,
  isLoading = false,
  isFetching = false,
  isError = false,
  onRetry,
  globalEmptyState,
}: Props) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StageAttendanceSort>("retorno");
  const visible = useMemo(
    () => selectStageAttendances(atendimentos, query, sort),
    [atendimentos, query, sort],
  );
  const total = atendimentos.length;
  const searching = query.trim().length > 0;
  const countText = searching
    ? `${visible.length} de ${total} atendimentos`
    : `${total} atendimento${total === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="atendimento-stage-title" className="min-w-0 space-y-4">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={cn("mt-1.5 h-10 w-1 shrink-0 rounded-full", pipelineStageUi[stage].dot)}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">
              {context}
            </p>
            <h2
              id="atendimento-stage-title"
              tabIndex={-1}
              className="mt-1 rounded-sm text-2xl font-semibold leading-tight tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[28px] [overflow-wrap:anywhere]"
            >
              {pipelineStageLabel(stage)}
            </h2>
            <p role="status" aria-live="polite" className="mt-1.5 text-sm text-muted-foreground">
              {isLoading ? "Carregando atendimentos…" : countText}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-10 self-start rounded-xl border-border bg-background/60 hover:bg-primary/10 hover:text-primary sm:self-center"
        >
          <ArrowLeft aria-hidden="true" />
          {backLabel}
        </Button>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 xl:flex-row xl:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="attendance-stage-search"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Buscar nesta etapa
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            />
            <Input
              id="attendance-stage-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, telefone, interesse…"
              className="h-10 rounded-xl bg-background/40 pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 size-10 rounded-xl"
                aria-label="Limpar busca nesta etapa"
                onClick={() => setQuery("")}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[440px]">
          <div className="min-w-0">
            <label
              htmlFor="attendance-stage-sort"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Ordenação
            </label>
            <Select value={sort} onValueChange={(value) => setSort(value as StageAttendanceSort)}>
              <SelectTrigger
                id="attendance-stage-sort"
                className="h-10 rounded-xl bg-background/40"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ArrowUpDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retorno">Próximo retorno</SelectItem>
                <SelectItem value="atualizacao">Atualização recente</SelectItem>
                <SelectItem value="criacao">Criação recente</SelectItem>
                <SelectItem value="nome">Nome</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <label
              htmlFor="attendance-stage-density"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Visualização
            </label>
            <Select
              value={density}
              onValueChange={(value) => onDensityChange(value as AtendimentoCardDensity)}
            >
              <SelectTrigger
                id="attendance-stage-density"
                className="h-10 rounded-xl bg-background/40"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <LayoutGrid
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compacta">Compacta</SelectItem>
                <SelectItem value="confortavel">Confortável</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isFetching && !isLoading ? (
        <p role="status" className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2
            aria-hidden="true"
            className="size-3.5 animate-spin motion-reduce:animate-none"
          />
          Atualizando atendimentos…
        </p>
      ) : null}
      {isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm text-foreground">
            Não foi possível atualizar os atendimentos.
            {total > 0 ? " Os dados disponíveis foram mantidos." : " Tente carregar novamente."}
          </p>
          <Button type="button" variant="outline" onClick={onRetry} className="h-10 rounded-xl">
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div
          aria-label="Carregando atendimentos"
          aria-busy="true"
          className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))]"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-72 rounded-2xl motion-reduce:animate-none" />
          ))}
        </div>
      ) : visible.length > 0 ? (
        <div
          className={cn(
            "grid items-stretch gap-3 sm:gap-4",
            density === "compacta"
              ? "[grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))]"
              : "[grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]",
          )}
        >
          {visible.map((atendimento) => (
            <AtendimentoCompactCard
              key={atendimento.id}
              atendimento={atendimento}
              density={density}
              onOpen={onOpen}
              onStageChange={onStageChange}
            />
          ))}
        </div>
      ) : !isError ? (
        <EmptyState
          title={
            searching
              ? "Nenhum contato encontrado nesta etapa"
              : globalEmptyState === "crm-empty"
                ? "Seu CRM ainda não tem atendimentos"
                : globalEmptyState === "filtered-empty"
                  ? "Nenhum atendimento neste recorte"
                  : "Esta etapa está livre por enquanto"
          }
          description={
            <p className="text-sm leading-6 text-muted-foreground">
              {searching
                ? "Tente outro nome, telefone ou interesse. Os filtros globais continuam aplicados."
                : globalEmptyState === "crm-empty"
                  ? "Cadastre um atendimento para começar a acompanhar seus contatos."
                  : globalEmptyState === "filtered-empty"
                    ? "Revise os filtros globais para consultar outros atendimentos."
                    : `Os atendimentos que estiverem em ${pipelineStageLabel(stage)} aparecerão aqui.`}
            </p>
          }
          action={
            searching ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuery("")}
                className="h-10 rounded-xl"
              >
                Limpar busca nesta etapa
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </section>
  );
}
