import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarCheck2, Camera, Plus } from "lucide-react";
import { GoogleCalendarCard } from "@/components/configuracoes/GoogleCalendarCard";
import { cn } from "@/lib/utils";

export type AgendaHeroVariant = "geral" | "fotos";

const views: {
  key: AgendaHeroVariant;
  to: "/agenda" | "/agenda/fotos";
  label: string;
  icon: typeof CalendarCheck2;
}[] = [
  { key: "geral", to: "/agenda", label: "Compromissos", icon: CalendarCheck2 },
  { key: "fotos", to: "/agenda/fotos", label: "Fotos", icon: Camera },
];

const copy: Record<
  AgendaHeroVariant,
  { eyebrow: string; title: string; cta: string; gradient: string }
> = {
  geral: {
    eyebrow: "Agenda da equipe",
    title: "Visitas e compromissos",
    cta: "Novo compromisso",
    gradient: "bg-[linear-gradient(120deg,#174d61_0%,#1a6b72_60%,#244a52_100%)]",
  },
  fotos: {
    eyebrow: "Agenda compartilhada",
    title: "Agenda de fotos",
    cta: "Nova sessão",
    gradient: "bg-[linear-gradient(120deg,#3a2f5c_0%,#5b4390_60%,#3d3354_100%)]",
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
        "relative overflow-hidden rounded-[1.4rem] text-white ring-1 ring-white/12",
        "shadow-[0_18px_40px_-26px_rgba(23,27,33,0.55)]",
        text.gradient,
      )}
      aria-labelledby="agenda-hero-title"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-cyan-200/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/18">
            <Icon className="size-[18px] text-orange-200" />
          </span>
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-orange-200/90">
              {text.eyebrow}
            </p>
            <h1
              id="agenda-hero-title"
              className="truncate font-display text-lg font-semibold leading-tight tracking-tight sm:text-xl"
            >
              {text.title}
            </h1>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <nav aria-label="Selecionar área da agenda" className="min-w-0">
            <div
              role="tablist"
              aria-orientation="horizontal"
              className="inline-flex gap-0.5 rounded-full bg-white/10 p-1 ring-1 ring-white/12"
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
                    aria-label={view.label}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                      active
                        ? "bg-white text-stone-900 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]"
                        : "text-white/72 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <TabIcon className="size-3.5" />
                    <span className="hidden min-[420px]:inline">{view.label}</span>
                    {active && typeof activeCount === "number" && (
                      <span className="hidden rounded-full min-[420px]:inline bg-stone-900/8 px-1.5 font-mono text-[10px] font-semibold text-stone-700">
                        {activeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <span className="ml-auto md:ml-0">
            <GoogleCalendarCard variant="icon" />
          </span>

          {canCreate && (
            <button
              type="button"
              onClick={onCreate}
              disabled={isCreating}
              aria-label={text.cta}
              className={cn(
                "group inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-orange-400 px-4 text-sm font-semibold text-stone-900",
                "shadow-[0_10px_24px_-12px_rgba(251,146,60,0.75)] ring-1 ring-orange-300/40",
                "transition duration-200 hover:bg-orange-300 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              <Plus className="size-4 transition-transform duration-300 group-hover:rotate-90" />
              <span className="hidden sm:inline">{text.cta}</span>
              <span className="sm:hidden">Novo</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
