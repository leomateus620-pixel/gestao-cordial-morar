import type { MarketingCampaignStatus } from "@/types/marketing";
import { getStatusTone } from "@/services/marketing";
import { cn } from "@/lib/utils";

export function CampaignStatusBadge({
  status,
  className,
}: {
  status: MarketingCampaignStatus;
  className?: string;
}) {
  const tone = getStatusTone(status);

  return (
    <span
      className={cn(
        "inline-flex min-h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold ring-1",
        tone === "success" && "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15",
        tone === "warning" && "bg-amber-500/12 text-amber-800 ring-amber-500/20",
        tone === "danger" && "bg-red-500/10 text-red-700 ring-red-500/18",
        tone === "analysis" && "bg-primary/10 text-primary ring-primary/15",
        tone === "neutral" && "bg-slate-500/10 text-slate-600 ring-slate-500/15",
        className,
      )}
    >
      {status}
    </span>
  );
}
