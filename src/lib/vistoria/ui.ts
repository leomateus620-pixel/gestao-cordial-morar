import type { InspectionStatus, ItemState } from "./model";

export const STATUS_TONE: Record<InspectionStatus, string> = {
  rascunho: "bg-foreground/8 text-foreground/70",
  em_andamento: "bg-primary/12 text-primary",
  em_revisao: "bg-amber-500/15 text-amber-700",
  concluida: "bg-emerald-500/15 text-emerald-700",
};

export const ITEM_STATE_TONE: Record<ItemState, string> = {
  pendente: "border-input text-foreground/60",
  bom: "border-emerald-600 bg-emerald-600/10 text-emerald-800",
  regular: "border-amber-600 bg-amber-500/10 text-amber-800",
  ruim: "border-destructive bg-destructive/10 text-destructive",
  nao_testado: "border-foreground/40 bg-foreground/5 text-foreground/80",
  nao_se_aplica: "border-foreground/30 bg-foreground/5 text-foreground/70",
};
export const fmtInspectionTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
