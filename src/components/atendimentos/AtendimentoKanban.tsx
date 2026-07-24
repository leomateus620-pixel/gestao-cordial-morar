import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  ACTIVE_PIPELINE_STAGES,
  pipelineStageLabel,
  pipelineStageOptions,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";
import { AtendimentoCard } from "@/components/atendimentos/AtendimentoCard";
import type { AtendimentoActionPayload } from "@/components/atendimentos/AtendimentoActionsDialog";
import { cn } from "@/lib/utils";

type Props = {
  atendimentos: Atendimento[];
  highlightId?: string;
  onOpenDetail: (a: Atendimento) => void;
  onConvert: (id: string) => void;
  onAction: (payload: AtendimentoActionPayload, a: Atendimento) => Promise<void> | void;
};

const KANBAN_STAGES: PipelineStage[] = ACTIVE_PIPELINE_STAGES;

export function AtendimentoKanban(props: Props) {
  return (
    <>
      <div className="hidden xl:block">
        <KanbanDesktop {...props} />
      </div>
      <div className="xl:hidden">
        <StageListMobile {...props} />
      </div>
    </>
  );
}

function groupByStage(items: Atendimento[]) {
  const map = new Map<PipelineStage, Atendimento[]>();
  for (const opt of pipelineStageOptions) map.set(opt.value, []);
  for (const a of items) {
    const list = map.get(a.pipelineStage) ?? [];
    list.push(a);
    map.set(a.pipelineStage, list);
  }
  return map;
}

function KanbanDesktop({ atendimentos, highlightId, onOpenDetail, onConvert, onAction }: Props) {
  const grouped = useMemo(() => groupByStage(atendimentos), [atendimentos]);
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${KANBAN_STAGES.length}, minmax(280px, 1fr))` }}>
      {KANBAN_STAGES.map((stage) => {
        const items = grouped.get(stage) ?? [];
        return (
          <div key={stage} className="flex flex-col gap-3 rounded-3xl bg-white/40 p-3 ring-1 ring-white/60">
            <header className="flex items-center justify-between px-1">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                {pipelineStageLabel(stage)}
              </h3>
              <span className="rounded-full bg-teal-700/12 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                {items.length}
              </span>
            </header>
            <div className="flex flex-col gap-2">
              {items.length === 0 ? (
                <p className="rounded-2xl bg-white/40 px-3 py-6 text-center text-[10px] text-foreground/45">
                  Sem cards nesta etapa.
                </p>
              ) : (
                items.map((a) => (
                  <div
                    key={a.id}
                    id={`atendimento-${a.id}`}
                    className={cn(
                      "cursor-pointer",
                      highlightId === a.id &&
                        "rounded-3xl ring-2 ring-orange-400 ring-offset-2 ring-offset-background",
                    )}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,select,textarea,input,a")) return;
                      onOpenDetail(a);
                    }}
                  >
                    <AtendimentoCard atendimento={a} onConvert={onConvert} onAction={onAction} />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageListMobile({ atendimentos, highlightId, onOpenDetail, onConvert, onAction }: Props) {
  const grouped = useMemo(() => groupByStage(atendimentos), [atendimentos]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-3">
      {KANBAN_STAGES.map((stage) => {
        const items = grouped.get(stage) ?? [];
        const isCollapsed = collapsed[stage] ?? items.length === 0;
        return (
          <section key={stage} className="rounded-3xl bg-white/40 p-3 ring-1 ring-white/60">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [stage]: !isCollapsed }))}
              className="flex w-full items-center justify-between px-1 py-1"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800">
                {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {pipelineStageLabel(stage)}
              </span>
              <span className="rounded-full bg-teal-700/12 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                {items.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="mt-2 flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="rounded-2xl bg-white/40 px-3 py-4 text-center text-[10px] text-foreground/45">
                    Sem cards.
                  </p>
                ) : (
                  items.map((a) => (
                    <div
                      key={a.id}
                      id={`atendimento-${a.id}`}
                      className={cn(
                        highlightId === a.id &&
                          "rounded-3xl ring-2 ring-orange-400 ring-offset-2 ring-offset-background",
                      )}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button,select,textarea,input,a")) return;
                        onOpenDetail(a);
                      }}
                    >
                      <AtendimentoCard atendimento={a} onConvert={onConvert} onAction={onAction} />
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
