import type { PipelineStage } from "@/types/atendimento";

export const pipelineStageUi: Record<
  PipelineStage,
  {
    order: string;
    accent: string;
    badge: string;
    column: string;
    dot: string;
  }
> = {
  primeiro_contato: {
    order: "01",
    accent: "border-sky-600/55",
    badge: "border-sky-700/20 bg-sky-700/10 text-sky-900",
    column: "border-sky-700/18 bg-sky-50/55",
    dot: "bg-sky-600",
  },
  apresentando_solucao: {
    order: "02",
    accent: "border-cyan-600/55",
    badge: "border-cyan-700/20 bg-cyan-700/10 text-cyan-900",
    column: "border-cyan-700/18 bg-cyan-50/55",
    dot: "bg-cyan-600",
  },
  visita: {
    order: "03",
    accent: "border-violet-600/55",
    badge: "border-violet-700/20 bg-violet-700/10 text-violet-900",
    column: "border-violet-700/18 bg-violet-50/50",
    dot: "bg-violet-600",
  },
  proposta: {
    order: "04",
    accent: "border-amber-600/60",
    badge: "border-amber-700/25 bg-amber-600/12 text-amber-950",
    column: "border-amber-700/20 bg-amber-50/55",
    dot: "bg-amber-600",
  },
  fechamento: {
    order: "05",
    accent: "border-emerald-600/60",
    badge: "border-emerald-700/25 bg-emerald-700/11 text-emerald-950",
    column: "border-emerald-700/20 bg-emerald-50/55",
    dot: "bg-emerald-600",
  },
  perdido: {
    order: "—",
    accent: "border-rose-600/55",
    badge: "border-rose-700/20 bg-rose-700/10 text-rose-900",
    column: "border-rose-700/18 bg-rose-50/50",
    dot: "bg-rose-600",
  },
  arquivado: {
    order: "—",
    accent: "border-stone-500/55",
    badge: "border-stone-700/20 bg-stone-700/10 text-stone-800",
    column: "border-stone-700/18 bg-stone-50/55",
    dot: "bg-stone-500",
  },
};
