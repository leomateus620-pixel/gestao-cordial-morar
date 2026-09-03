import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarCheck2, Camera, Plus } from "lucide-react";
import { GoogleCalendarCard } from "@/components/configuracoes/GoogleCalendarCard";
import { cn } from "@/lib/utils";

export type AgendaHeroVariant = "geral" | "fotos";

const views: {
  key: AgendaHeroVariant;
  to: "/agenda" | "/agenda/fotos";
  label: string;
  shortLabel: string;
  icon: typeof CalendarCheck2;
}[] = [
  {
    key: "geral",
    to: "/agenda",
    label: "Visitas e compromissos",
    shortLabel: "Compromissos",
    icon: CalendarCheck2,
  },
  {
    key: "fotos",
    to: "/agenda/fotos",
    label: "Agenda de fotos",
    shortLabel: "Fotos",
    icon: Camera,
  },
];

const copy: Record<
  AgendaHeroVariant,
  { eyebrow: string; title: string; description: string; cta: string; gradient: string }
> = {
  geral: {
    eyebrow: "Agenda da equipe",
    title: "Visitas e compromissos",
    description:
      "Visitas, retornos, assinaturas e tarefas da equipe em um só lugar, sincronizados com o Google Agenda.",
    cta: "Novo compromisso",
    gradient: "bg-[linear-gradient(135deg,#174d61_0%,#1a6b72_52%,#28333b_100%)]",
  },
  fotos: {
    eyebrow: "Agenda compartilhada",
    title: "Agenda de fotos",
    description:
      "Sessões de fotos e vídeos dos imóveis, visíveis para toda a equipe operacional. Edição restrita ao responsável, criador, secretaria e admin.",
    cta: "Nova sessão",
    gradient: "bg-[linear-gradient(135deg,#3a2f5c_0%,#5b4390_52%,#28333b_100%)]",
  },
};

export function AgendaHero({
  variant,
  activeCount,
  canCreate = true,
  isCreating = false,
  onCreate,
}: {
  variant: AgendaHeroVariant;
  /** Number of items in the current view after filters; shown on the active tab. */
  activeCount?: number;
  canCreate?: boolean;
  /** True while the creation modal is open; softens the CTA to signal the in-progress action. */
  isCreating?: boolean;
  onCreate: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeKey: AgendaHeroVariant = pathname.startsWith("/agenda/fotos") ? "fotos" : "geral";
  const text = copy[variant];
  const Icon = variant === "fotos" ? Camera : CalendarCheck2;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] text-white ring-1 ring-white/12",
        "shadow-[0_26px_60px_-28px_rgba(23,27,33,0.6)]",
        text.gradient,
      )}
      aria-labelledby="agenda-hero-title"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-cyan-200/12 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 left-1/4 size-48 rounded-full bg-orange-300/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent"
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/18 shadow-inner sm:size-13">
              <Icon className="size-5 text-orange-200 sm:size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-200/90">
                {text.eyebrow}
              </p>
              <h1
                id="agenda-hero-title"
                className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl"
              >
                {text.title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-white/68 sm:text-[13px]">
                {text.description}
              </p>
            </div>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={onCreate}
              disabled={isCreating}
              className={cn(
                "group inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-orange-400 px-4 py-3 text-sm font-semibold text-stone-900",
                "shadow-[0_12px_30px_-12px_rgba(251,146,60,0.7)] ring-1 ring-orange-300/40",
                "transition duration-200 hover:bg-orange-300 hover:shadow-[0_18px_40px_-12px_rgba(251,146,60,0.75)] active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-900",
                "disabled:pointer-events-none disabled:opacity-60 md:w-auto",
              )}
            >
              <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" />
              {text.cta}
            </button>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Selecionar área da agenda" className="min-w-0">
            <div
              role="tablist"
              aria-orientation="horizontal"
              className="inline-flex max-w-full gap-1 rounded-full bg-white/10 p-1 ring-1 ring-white/12"
            >
              {views.map((view) => {
                const active = view.key === activeKey;
                const TabIcon = view.icon;
                return (
                  <Link
                    key={view.key}
                    to={view.to}
                    role="tab"
                    aria-selected={active}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-xs font-semibold tracking-tight transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                      active
                        ? "bg-white text-stone-900 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)]"
                        : "text-white/72 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <TabIcon className="size-3.5" />
                    <span className="hidden sm:inline">{view.label}</span>
                    <span className="sm:hidden">{view.shortLabel}</span>
                    {active && typeof activeCount === "number" && (
                      <span className="rounded-full bg-stone-900/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-stone-700">
                        {activeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <GoogleCalendarCard variant="inline" tone="dark" />
        </div>
      </div>
    </section>
  );
}
