import type { InspectionStatus } from "./model";

export const STATUS_TONE: Record<InspectionStatus, string> = {
  rascunho: "bg-foreground/8 text-foreground/70",
  em_andamento: "bg-primary/12 text-primary",
  em_revisao: "bg-amber-500/15 text-amber-700",
  concluida: "bg-emerald-500/15 text-emerald-700",
};
