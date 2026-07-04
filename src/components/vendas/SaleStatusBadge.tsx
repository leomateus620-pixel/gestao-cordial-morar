import { CheckCircle2, Clock3, FileCheck2, FileWarning, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaleDocumentStatus, SaleStatus } from "@/types/sale";

const saleStatusMap: Record<
  SaleStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  concluida: {
    label: "Concluída",
    className: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/15",
    icon: CheckCircle2,
  },
  aguardando_assinatura: {
    label: "Aguardando assinatura",
    className: "bg-amber-500/12 text-amber-700 ring-amber-600/15",
    icon: Clock3,
  },
  em_analise: {
    label: "Em análise",
    className: "bg-violet-500/10 text-violet-700 ring-violet-600/15",
    icon: PauseCircle,
  },
  cancelada: {
    label: "Cancelada",
    className: "bg-rose-500/10 text-rose-700 ring-rose-600/15",
    icon: XCircle,
  },
};

const documentStatusMap: Record<
  SaleDocumentStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  contrato_anexado: {
    label: "Contrato anexado",
    className: "bg-cyan-500/10 text-cyan-700 ring-cyan-600/15",
    icon: FileCheck2,
  },
  contrato_pendente: {
    label: "Contrato pendente",
    className: "bg-amber-500/12 text-amber-700 ring-amber-600/15",
    icon: FileWarning,
  },
  aguardando_assinatura: {
    label: "Aguardando assinatura",
    className: "bg-amber-500/12 text-amber-700 ring-amber-600/15",
    icon: Clock3,
  },
  em_analise: {
    label: "Em revisão",
    className: "bg-violet-500/10 text-violet-700 ring-violet-600/15",
    icon: PauseCircle,
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-rose-500/10 text-rose-700 ring-rose-600/15",
    icon: XCircle,
  },
};

export function SaleStatusBadge({
  status,
  type = "sale",
  className,
}: {
  status: SaleStatus | SaleDocumentStatus;
  type?: "sale" | "document";
  className?: string;
}) {
  const item =
    type === "sale"
      ? saleStatusMap[status as SaleStatus]
      : documentStatusMap[status as SaleDocumentStatus];
  const Icon = item.icon;

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold leading-none ring-1",
        item.className,
        className,
      )}
    >
      <Icon className="size-3" />
      {item.label}
    </span>
  );
}
