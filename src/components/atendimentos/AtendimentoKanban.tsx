import { useMemo } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, CircleDot } from "lucide-react";
import { AtendimentoCard } from "@/components/atendimentos/AtendimentoCard";
import type { AtendimentoActionPayload } from "@/components/atendimentos/AtendimentoActionsDialog";
import { pipelineStageUi } from "@/components/atendimentos/pipeline-ui";
import { isAtendimentoOverdue } from "@/services/atendimentos";
import {
  ACTIVE_PIPELINE_STAGES,
  pipelineStageLabel,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";
import { cn } from "@/lib/utils";

type Props = {
  atendimentos: Atendimento[];
  selectedStage: PipelineStage;
  onSelectedStageChange: (stage: PipelineStage) => void;
  highlightId?: string;
  onOpenDetail: (atendimento: Atendimento) => void;
  onStageChange: (id: string, stage: PipelineStage) => Promise<void> | void;
  onAction: (payload: AtendimentoActionPayload, atendimento: Atendimento) => Promise<void> | void;
  brokerOptions?: Array<{ id: string; nome: string }>;
};

export function AtendimentoKanban(props: Props) {
  const grouped = useMemo(() => groupByStage(props.atendimentos), [props.atendimentos]);
  const terminalItems = useMemo(
    () =>
      props.atendimentos.filter(
        (item) => item.pipelineStage === "perdido" || item.pipelineStage === "arquivado",
      ),
    [props.atendimentos],
  );
  const activeItemCount = useMemo(
    () =>
      props.atendimentos.filter((item) => ACTIVE_PIPELINE_STAGES.includes(item.pipelineStage))
        .length,
    [props.atendimentos],
  );

  return (
    <div className="space-y-4">
      <div className="hidden lg:block">
        <KanbanDesktop {...props} grouped={grouped} />
      </div>
      <div className="lg:hidden">
        <StageListMobile {...props} grouped={grouped} />
      </div>
      {terminalItems.length > 0 && activeItemCount === 0 ? (
        <TerminalResults {...props} items={terminalItems} />
      ) : null}
    </div>
  );
}

function groupByStage(items: Atendimento[]) {
  const map = new Map<PipelineStage, Atendimento[]>(
    ACTIVE_PIPELINE_STAGES.map((stage) => [stage, []]),
  );
  for (const atendimento of items) {
    const current = map.get(atendimento.pipelineStage);
    if (current) current.push(atendimento);
  }
  return map;
}

function KanbanDesktop({
  grouped,
  ...props
}: Props & { grouped: Map<PipelineStage, Atendimento[]> }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-5 sm:px-5 lg:mx-0 lg:px-0">
      <div className="grid min-w-[1500px] grid-cols-5 gap-4 2xl:min-w-0">
        {ACTIVE_PIPELINE_STAGES.map((stage) => {
          const items = grouped.get(stage) ?? [];
          const overdue = items.filter((item) => isAtendimentoOverdue(item)).length;
          const missingAction = items.filter(
            (item) => !item.proximoRetorno || !item.proximoPasso,
          ).length;
          const ui = pipelineStageUi[stage];
          return (
            <section
              key={stage}
              className={cn(
                "min-w-0 overflow-hidden rounded-[1.65rem] border shadow-[0_14px_34px_-28px_rgba(31,41,55,0.9)]",
                ui.column,
              )}
              aria-labelledby={`stage-${stage}`}
            >
              <header className="border-b border-stone-900/8 bg-white/72 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.17em] text-stone-400">
                      Etapa {ui.order}
                    </p>
                    <h3
                      id={`stage-${stage}`}
                      className="mt-1 text-[13px] font-extrabold leading-5 tracking-[-0.01em] text-stone-900"
                    >
                      {pipelineStageLabel(stage)}
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "grid min-w-8 place-items-center rounded-full border px-2 py-1 text-xs font-extrabold",
                      ui.badge,
                    )}
                  >
                    {items.length}
                  </span>
                </div>
                <div className="mt-2.5 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold text-stone-500">
                  {overdue > 0 ? (
                    <span className="inline-flex items-center gap-1 text-rose-700">
                      <AlertCircle className="size-3" />
                      {overdue} atrasado{overdue === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="size-3" />
                      Sem atrasos
                    </span>
                  )}
                  {missingAction > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <CircleDot className="size-3" />
                      {missingAction} sem próxima ação
                    </span>
                  ) : null}
                </div>
              </header>

              <div className="min-h-[26rem] space-y-3 p-3">
                {items.length > 0 ? (
                  items.map((atendimento) => (
                    <div
                      key={atendimento.id}
                      className={cn(
                        "rounded-[1.4rem] transition duration-200",
                        props.highlightId === atendimento.id &&
                          "ring-2 ring-orange-500 ring-offset-2 ring-offset-background",
                      )}
                    >
                      <AtendimentoCard
                        atendimento={atendimento}
                        onOpen={props.onOpenDetail}
                        onStageChange={props.onStageChange}
                        onAction={props.onAction}
                        brokerOptions={props.brokerOptions}
                      />
                    </div>
                  ))
                ) : (
                  <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-stone-400/35 bg-white/45 px-5 text-center">
                    <div>
                      <span
                        className={cn("mx-auto block size-2 rounded-full", ui.dot)}
                        aria-hidden="true"
                      />
                      <p className="mt-2 text-xs font-bold text-stone-700">Nenhum atendimento</p>
                      <p className="mt-1 text-[10px] leading-4 text-stone-500">
                        Os atendimentos movidos para esta etapa aparecerão aqui.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StageListMobile({
  grouped,
  selectedStage,
  onSelectedStageChange,
  ...props
}: Props & { grouped: Map<PipelineStage, Atendimento[]> }) {
  const selectedItems = grouped.get(selectedStage) ?? [];
  const ui = pipelineStageUi[selectedStage];
  const overdue = selectedItems.filter((item) => isAtendimentoOverdue(item)).length;
  return (
    <section>
      <div className="sticky top-0 z-10 -mx-4 border-y border-stone-900/8 bg-background/94 px-4 py-2.5 backdrop-blur-xl sm:-mx-5 sm:px-5">
        <div
          className="no-scrollbar flex gap-2 overflow-x-auto"
          role="tablist"
          aria-label="Etapas do funil"
        >
          {ACTIVE_PIPELINE_STAGES.map((stage) => {
            const active = stage === selectedStage;
            const stageUi = pipelineStageUi[stage];
            const count = grouped.get(stage)?.length ?? 0;
            return (
              <button
                key={stage}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectedStageChange(stage)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[11px] font-extrabold transition duration-200",
                  active ? stageUi.badge : "border-stone-900/10 bg-white/72 text-stone-600",
                )}
              >
                {pipelineStageLabel(stage)}
                <span className="grid min-w-5 place-items-center rounded-full bg-white/70 px-1.5 py-0.5 text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <header
        className={cn(
          "mt-3 flex items-center justify-between rounded-2xl border px-4 py-3",
          ui.column,
        )}
      >
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-stone-500">
            Etapa {ui.order}
          </p>
          <h3 className="mt-0.5 text-sm font-extrabold text-stone-900">
            {pipelineStageLabel(selectedStage)}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-stone-900">{selectedItems.length}</p>
          <p className={cn("text-[9px] font-bold", overdue ? "text-rose-700" : "text-stone-500")}>
            {overdue ? `${overdue} em atraso` : "sem atrasos"}
          </p>
        </div>
      </header>

      <div className="mt-3 space-y-3">
        {selectedItems.length > 0 ? (
          selectedItems.map((atendimento) => (
            <div
              key={atendimento.id}
              className={cn(
                "rounded-[1.4rem]",
                props.highlightId === atendimento.id &&
                  "ring-2 ring-orange-500 ring-offset-2 ring-offset-background",
              )}
            >
              <AtendimentoCard
                atendimento={atendimento}
                onOpen={props.onOpenDetail}
                onStageChange={props.onStageChange}
                onAction={props.onAction}
                brokerOptions={props.brokerOptions}
              />
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-400/40 bg-white/55 px-5 py-10 text-center">
            <p className="text-sm font-bold text-stone-700">Etapa vazia</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Selecione outra etapa ou mova um atendimento para cá.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function TerminalResults({ items, ...props }: Props & { items: Atendimento[] }) {
  return (
    <section className="rounded-[1.5rem] border border-stone-900/10 bg-stone-100/70 p-3">
      <header className="flex items-center justify-between gap-3 px-1 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-stone-900">Resultados encerrados</h3>
          <p className="mt-0.5 text-[10px] text-stone-500">
            Perdidos e arquivados preservados fora do funil ativo.
          </p>
        </div>
        <ArrowRight className="size-4 text-stone-400" />
      </header>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((atendimento) => (
          <AtendimentoCard
            key={atendimento.id}
            atendimento={atendimento}
            onOpen={props.onOpenDetail}
            onStageChange={props.onStageChange}
            onAction={props.onAction}
            brokerOptions={props.brokerOptions}
          />
        ))}
      </div>
    </section>
  );
}
