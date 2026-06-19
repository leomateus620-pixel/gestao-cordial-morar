import { BadgeCheck, Camera, ClipboardCheck, HardDrive, HousePlus, MapPinned } from "lucide-react";
import type { AgenciamentoSummary } from "@/types/agenciamento";
import { cn } from "@/lib/utils";

type AgenciamentoSummaryCardsProps = {
  summary: AgenciamentoSummary;
  variant: "admin" | "corretor";
};

export function AgenciamentoSummaryCards({ summary, variant }: AgenciamentoSummaryCardsProps) {
  const cards =
    variant === "admin"
      ? [
          {
            label: "Agenciamentos no mes",
            value: summary.mes,
            detail: `${summary.total} no periodo`,
            icon: HousePlus,
            tone: "primary",
          },
          {
            label: "Pendentes validacao",
            value: summary.pendentesValidacao,
            detail: "aguardando diretoria",
            icon: ClipboardCheck,
            tone: "warning",
          },
          {
            label: "Fotos no Drive",
            value: summary.fotosDrive,
            detail: `${summary.percentualChecklistMedio}% checklist medio`,
            icon: HardDrive,
            tone: "base",
          },
          {
            label: "Placas instaladas",
            value: summary.placasInstaladas,
            detail: "imoveis sinalizados",
            icon: MapPinned,
            tone: "base",
          },
          {
            label: "No site",
            value: summary.cadastradosSite,
            detail: "carteira publicada",
            icon: Camera,
            tone: "base",
          },
          {
            label: "Validados",
            value: summary.validados,
            detail: "aptos para gratificacao",
            icon: BadgeCheck,
            tone: "success",
          },
        ]
      : [
          {
            label: "Meus agenciamentos",
            value: summary.mes,
            detail: `${summary.total} no periodo`,
            icon: HousePlus,
            tone: "primary",
          },
          {
            label: "Pendentes",
            value: summary.pendentesValidacao,
            detail: "aguardando validacao",
            icon: ClipboardCheck,
            tone: "warning",
          },
          {
            label: "Checklist completo",
            value: summary.checklistCompleto,
            detail: `${summary.percentualChecklistMedio}% medio`,
            icon: BadgeCheck,
            tone: "success",
          },
          {
            label: "Validados",
            value: summary.validados,
            detail: "concluidos",
            icon: BadgeCheck,
            tone: "base",
          },
          {
            label: "Placas instaladas",
            value: summary.placasInstaladas,
            detail: "em campo",
            icon: MapPinned,
            tone: "base",
          },
          {
            label: "Fotos no Drive",
            value: summary.fotosDrive,
            detail: "organizadas",
            icon: HardDrive,
            tone: "base",
          },
        ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.label}
            className={cn(
              "group min-w-0 overflow-hidden rounded-2xl border border-white/60 bg-white/[0.62] p-3 shadow-[0_14px_36px_-22px_rgba(23,27,33,0.24)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 sm:p-4",
              card.tone === "primary" && "bg-primary/[0.075]",
              card.tone === "warning" && "bg-[rgba(217,120,45,0.09)]",
              card.tone === "success" && "bg-emerald-500/[0.075]",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">
                {card.label}
              </p>
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl bg-white/65 text-primary ring-1 ring-foreground/5",
                  card.tone === "warning" && "text-[var(--system-accent-dark)]",
                  card.tone === "success" && "text-emerald-700",
                )}
              >
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 truncate font-mono text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[1.65rem] 2xl:text-3xl">
              {String(card.value).padStart(2, "0")}
            </p>
            <p className="mt-2 truncate text-[11px] font-medium text-foreground/52">
              {card.detail}
            </p>
          </article>
        );
      })}
    </section>
  );
}
