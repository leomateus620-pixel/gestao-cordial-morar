import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Camera,
  ClipboardCheck,
  HardDrive,
  HousePlus,
  MapPinned,
  ArrowRight,
} from "lucide-react";
import type { AgenciamentoSummary } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type Item = {
  key: string;
  label: string;
  value: number;
  detail: string;
  icon: typeof HousePlus;
  tone: "primary" | "warning" | "success" | "base";
};

export function AgenciamentosQuickStrip({ summary }: { summary: AgenciamentoSummary }) {
  const items: Item[] = [
    {
      key: "mes",
      label: "No mês",
      value: summary.mes,
      detail: `${summary.total} no período`,
      icon: HousePlus,
      tone: "primary",
    },
    {
      key: "pendentes",
      label: "Pendentes",
      value: summary.pendentesValidacao,
      detail: "validação",
      icon: ClipboardCheck,
      tone: "warning",
    },
    {
      key: "fotos",
      label: "Fotos Drive",
      value: summary.fotosDrive,
      detail: `${summary.percentualChecklistMedio}% checklist`,
      icon: HardDrive,
      tone: "base",
    },
    {
      key: "placas",
      label: "Placas",
      value: summary.placasInstaladas,
      detail: "instaladas",
      icon: MapPinned,
      tone: "base",
    },
    {
      key: "site",
      label: "No site",
      value: summary.cadastradosSite,
      detail: "publicados",
      icon: Camera,
      tone: "base",
    },
    {
      key: "validados",
      label: "Validados",
      value: summary.validados,
      detail: "aptos gratificação",
      icon: BadgeCheck,
      tone: "success",
    },
  ];

  return (
    <section className="mb-5" aria-label="Resumo de agenciamentos">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/55">
          Agenciamentos
        </p>
        <Link
          to="/agenciamentos"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Ver tudo <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              to="/agenciamentos"
              className={cn(
                "glass-panel min-w-28 shrink-0 rounded-2xl px-3 py-3 transition hover:-translate-y-0.5 hover:bg-white/70 lg:min-w-0",
                item.tone === "primary" && "bg-primary/[0.075]",
                item.tone === "warning" && "bg-[rgba(217,120,45,0.09)]",
                item.tone === "success" && "bg-emerald-500/[0.075]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon
                  className={cn(
                    "size-3.5 text-teal-700/70",
                    item.tone === "warning" && "text-[var(--system-accent-dark)]",
                    item.tone === "success" && "text-emerald-700",
                  )}
                />
                <span className="font-mono text-lg font-semibold text-foreground">
                  {String(item.value).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.1em] text-foreground/48">
                {item.label}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-foreground/52">{item.detail}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
